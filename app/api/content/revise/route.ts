import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import type { ComplianceFlag } from "@/lib/compliance/filter";
import { cookies } from "next/headers";
import type { Locale } from "@/lib/translations";

function getLocaleFromCookie(): Locale {
  const cookieStore = cookies();
  const locale = cookieStore.get("pt_locale")?.value as Locale;
  if (locale && (["en", "zh", "ms"] as Locale[]).includes(locale)) return locale;
  return "en";
}

async function reviseWithClaude(content: string, flags: ComplianceFlag[], locale: Locale): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return content;
  }

  const issueList = flags
    .map((f, i) => `${i + 1}. [${f.code}] ${f.message} — near: "${f.excerpt}"`)
    .join("\n");

  const langInstruction =
    locale === "zh"
      ? "Respond ONLY in Simplified Chinese."
      : locale === "ms"
      ? "Respond ONLY in Bahasa Malaysia."
      : "Respond ONLY in English.";

  const prompt = `You are helping a Herbalife distributor fix their social media post to comply with Herbalife marketing rules.

${langInstruction}

The following content has compliance violations:
---
${content}
---

Violations found:
${issueList}

Herbalife compliance rules:
- NO income claims (e.g. "earn RM 5000", "passive income", "extra cash")
- NO specific monetary amounts (RM, USD, etc.)
- NO specific weight or measurement claims (e.g. "lost 5kg", "dropped 10 lbs")
- NO specific percentage claims (e.g. "30% more energy")
- NO specific timeline claims (e.g. "results in 2 weeks")
- NO disease treatment or cure claims
- NO guaranteed results language
- If the content mentions products, results, nutrition, shakes, supplements, or energy, you MUST add this disclaimer at the end: "Results may vary. Products are not intended to diagnose, treat, cure, or prevent any disease."

Rewrite the post to fix ALL violations. Keep the same language, tone, and emotional intent. Only change what is necessary to pass compliance. Return ONLY the revised post — no explanation, no preamble.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error("AI revision failed");
  const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  return body.content?.find((part) => part.type === "text")?.text?.trim() ?? content;
}

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const raw = (await request.json().catch(() => null)) as {
      draftId?: string;
      userDraft?: string;
      flags?: ComplianceFlag[];
    } | null;

    if (!raw?.draftId || !raw?.userDraft) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const userDb = scopedDb(account.id);
    const draft = await userDb.content.getDraft(raw.draftId);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

    const flags = Array.isArray(raw.flags) ? raw.flags : [];
    const locale = getLocaleFromCookie();

    const revisedContent = await reviseWithClaude(raw.userDraft, flags, locale);

    await userDb.content.updateDraft(draft.id, {
      userDraft: revisedContent,
      complianceStatus: "pending",
    });

    return NextResponse.json({ data: { revisedContent } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revision failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
