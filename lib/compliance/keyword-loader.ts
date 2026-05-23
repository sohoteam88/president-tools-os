import fs from "fs";
import path from "path";

export interface KeywordEntry {
  category: string;
  pattern: RegExp;
  message: string;
}

let cache: KeywordEntry[] | null = null;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function loadKeywords(): KeywordEntry[] {
  if (cache) return cache;
  const csv = fs.readFileSync(
    path.join(process.cwd(), "lib/compliance/keywords.csv"),
    "utf-8"
  );
  cache = csv
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [category = "", rawPattern = "", message = ""] = parseCsvLine(line);
      return {
        category: category.trim(),
        pattern: new RegExp(rawPattern.trim(), "i"),
        message: message.trim(),
      };
    });
  return cache;
}
