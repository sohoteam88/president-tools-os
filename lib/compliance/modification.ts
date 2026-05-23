export const MODIFICATION_THRESHOLD = 0.8;

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function computeSimilarity(textA: string, textB: string): number {
  return jaccardSimilarity(tokenize(textA), tokenize(textB));
}

export function isModifiedEnough(originalDraft: string, userDraft: string): boolean {
  return computeSimilarity(originalDraft, userDraft) <= MODIFICATION_THRESHOLD;
}
