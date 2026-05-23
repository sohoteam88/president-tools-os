import { loadKeywords } from "./keyword-loader";

export interface ComplianceResult {
  passed: boolean;
  flags: ComplianceFlag[];
  checkedLayers: Array<{
    layer: 1 | 2 | 3 | 4;
    result: "passed" | "flagged" | "skipped";
    flagCodes: string[];
    details: string;
  }>;
}

export interface ComplianceFlag {
  layer: 1 | 2 | 3 | 4;
  code: string;
  excerpt: string;
  message: string;
}

function excerpt(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 30), Math.min(text.length, index + length + 30)).slice(0, 100);
}

function isProtectedToken(token: string): boolean {
  return token.startsWith("#") || /^https?:\/\//i.test(token);
}

function layer1(text: string): ComplianceFlag | null {
  for (const entry of loadKeywords()) {
    const match = entry.pattern.exec(text);
    if (match?.index !== undefined) {
      return {
        layer: 1,
        code: entry.category,
        excerpt: excerpt(text, match.index, match[0]?.length ?? 0),
        message: entry.message,
      };
    }
  }
  return null;
}

function layer2(text: string): ComplianceFlag | null {
  const rules = [
    { code: "NUMERIC_MONEY_CLAIM", pattern: /RM\s*[\d,]+/i, message: "Contains a specific monetary amount" },
    { code: "NUMERIC_MONEY_CLAIM", pattern: /USD?\s*[\d,]+/i, message: "Contains a specific monetary amount" },
    { code: "NUMERIC_WEIGHT_CLAIM", pattern: /\d+\s*kg/i, message: "Contains a specific weight claim" },
    { code: "NUMERIC_WEIGHT_CLAIM", pattern: /\d+\s*(lbs?|pounds?)/i, message: "Contains a specific weight claim" },
    { code: "NUMERIC_PERCENT_CLAIM", pattern: /\d+\s*%/i, message: "Contains a specific percentage claim" },
    { code: "RESULTS_TIMELINE_CLAIM", pattern: /\d+\s*(days?|weeks?|months?) results/i, message: "Contains a specific results timeline" },
  ];

  for (const rule of rules) {
    const match = rule.pattern.exec(text);
    const raw = match?.[0];
    if (match?.index !== undefined && raw && !isProtectedToken(raw)) {
      if (rule.code === "NUMERIC_PERCENT_CLAIM" && /100\s*%\s+of\s+the\s+time/i.test(text)) {
        continue;
      }
      return {
        layer: 2,
        code: rule.code,
        excerpt: excerpt(text, match.index, raw.length),
        message: rule.message,
      };
    }
  }
  return null;
}

async function callHaiku(text: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_HAIKU_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `You are a compliance reviewer for Herbalife Malaysia distributor content.
Herbalife's rules prohibit: income claims, specific weight/health claims,
disease treatment claims, income opportunity recruitment language, and
guaranteed results of any kind.

Review the following distributor content:
---
${text}
---

Does this content contain ANY compliance violation?
Reply with EXACTLY this format:
VERDICT: PASS or FAIL
REASON: [one sentence, or "None" if PASS]`,
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    return body.content?.find((part) => part.type === "text")?.text ?? null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[compliance:layer3] timeout");
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function layer3(text: string): Promise<ComplianceFlag | "skipped" | null> {
  const response = await callHaiku(text);
  if (!response) return "skipped";
  const lines = response.split("\n");
  if (!/FAIL/i.test(lines[0] ?? "")) return null;
  const reason = lines.find((line) => line.startsWith("REASON:"))?.replace(/^REASON:\s*/i, "") ?? "AI review flagged this content";
  return {
    layer: 3,
    code: "LLM_COMPLIANCE_FAIL",
    excerpt: text.slice(0, 100),
    message: reason,
  };
}

function layer4(text: string): ComplianceFlag | null {
  const triggers = /\b(product|nutrition|shake|supplement|results|lost|gained|energy)\b/i;
  if (!triggers.test(text)) return null;
  const disclosure =
    process.env.COMPLIANCE_DISCLOSURE_TEXT ??
    "Results may vary. Products are not intended to diagnose, treat, cure, or prevent any disease.";
  if (text.toLowerCase().includes(disclosure.toLowerCase())) return null;
  return {
    layer: 4,
    code: "MISSING_DISCLOSURE",
    excerpt: text.slice(0, 100),
    message: `Content mentions results or products but is missing the required disclaimer. Add: ${disclosure}`,
  };
}

export async function runComplianceFilter(
  text: string,
  _accountId: string,
  _draftId: string
): Promise<ComplianceResult> {
  const checkedLayers: ComplianceResult["checkedLayers"] = [];

  const firstFlag = layer1(text);
  checkedLayers.push({
    layer: 1,
    result: firstFlag ? "flagged" : "passed",
    flagCodes: firstFlag ? [firstFlag.code] : [],
    details: firstFlag?.message ?? "Passed keyword blacklist",
  });
  if (firstFlag) return { passed: false, flags: [firstFlag], checkedLayers };

  const secondFlag = layer2(text);
  checkedLayers.push({
    layer: 2,
    result: secondFlag ? "flagged" : "passed",
    flagCodes: secondFlag ? [secondFlag.code] : [],
    details: secondFlag?.message ?? "Passed numeric claim detector",
  });
  if (secondFlag) return { passed: false, flags: [secondFlag], checkedLayers };

  const thirdFlag = await layer3(text);
  checkedLayers.push({
    layer: 3,
    result: thirdFlag === "skipped" ? "skipped" : thirdFlag ? "flagged" : "passed",
    flagCodes: thirdFlag && thirdFlag !== "skipped" ? [thirdFlag.code] : [],
    details:
      thirdFlag === "skipped"
        ? "Skipped AI review"
        : thirdFlag
          ? thirdFlag.message
          : "Passed AI review",
  });
  if (thirdFlag && thirdFlag !== "skipped") {
    return { passed: false, flags: [thirdFlag], checkedLayers };
  }

  const fourthFlag = layer4(text);
  checkedLayers.push({
    layer: 4,
    result: fourthFlag ? "flagged" : "passed",
    flagCodes: fourthFlag ? [fourthFlag.code] : [],
    details: fourthFlag?.message ?? "Passed disclosure check",
  });

  return {
    passed: !fourthFlag,
    flags: fourthFlag ? [fourthFlag] : [],
    checkedLayers,
  };
}
