export const OBJECTION_CATEGORIES = [
  "price",
  "skepticism",
  "mlm_concern",
  "time",
  "loyalty",
] as const;

export type ObjectionCategory = (typeof OBJECTION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ObjectionCategory, string> = {
  price: "Price & Affordability",
  skepticism: "Product Skepticism",
  mlm_concern: "MLM & Business Concerns",
  time: "Time & Commitment",
  loyalty: "Already Using Another Brand",
};

export const CATEGORY_DESCRIPTIONS: Record<ObjectionCategory, string> = {
  price: "When prospects say it's too expensive or out of budget",
  skepticism: "When prospects doubt the product works",
  mlm_concern: "When prospects are wary about the business model",
  time: "When prospects say they're too busy",
  loyalty: "When prospects are happy with their current brand",
};

export const TONE_LABELS: Record<string, string> = {
  empathetic: "Empathetic",
  logical: "Logical",
  story: "Story-based",
};
