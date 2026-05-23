export const WHY_STORY_QUESTIONS = [
  "生活在加入 Herbalife 之前是什么样的？（工作、健康、财务、人际关系）",
  "让你决定加入的转折点是什么？",
  "你在 Herbalife 的第一个成果或突破是什么？",
  "现在和以前的一天有什么不同？",
  "你想让未来团队成员了解这段旅程的一件事是什么？",
] as const;

export type WhyStoryQuestionIndex = 0 | 1 | 2 | 3 | 4;

export type MomentType =
  | "success_story"
  | "challenge_overcome"
  | "lifestyle_glimpse"
  | "product_experience"
  | "mindset_shift";

export const MOMENT_TYPES: MomentType[] = [
  "success_story",
  "challenge_overcome",
  "lifestyle_glimpse",
  "product_experience",
  "mindset_shift",
];

export const MOMENT_TYPE_LABELS: Record<MomentType, string> = {
  success_story: "成功故事",
  challenge_overcome: "克服挑战",
  lifestyle_glimpse: "生活片段",
  product_experience: "产品体验",
  mindset_shift: "心态转变",
};

export type DraftMoment = {
  questionIndex: number;
  rawText: string;
  momentType: MomentType;
  extracted: string;
};

export type ContentDraftSeed = {
  momentId: string;
  topic: string;
  angle: string;
  suggestedFormat: "story" | "tip" | "testimonial" | "lifestyle" | "education";
  seedText: string;
};
