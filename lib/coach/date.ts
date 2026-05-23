export function getMytDateString(date: Date = new Date()): string {
  const myt = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = myt.getUTCFullYear();
  const m = String(myt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(myt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getMytTomorrowString(date: Date = new Date()): string {
  return getMytDateString(new Date(date.getTime() + 24 * 60 * 60 * 1000));
}
