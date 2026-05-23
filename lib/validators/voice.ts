import { z } from "zod";

export const captureTypeSchema = z.enum(["why_story", "daily_journey"]);
export const captureListTypeSchema = z.enum([
  "why_story",
  "daily_journey",
  "weekly_compile",
]);

export const uploadUrlSchema = z.object({
  captureType: captureTypeSchema,
  durationSeconds: z.number().int().positive(),
});

export const confirmUploadSchema = z.object({
  captureId: z.string().uuid(),
});

export const capturesQuerySchema = z.object({
  type: captureListTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const rebuildProfileSchema = z.object({
  force: z.boolean().optional(),
});

export const resetWhyStorySchema = z.object({
  accountId: z.string().uuid(),
});

export const voiceProfileJsonSchema = z.object({
  vocabulary_level: z.enum(["simple", "conversational", "sophisticated"]),
  sentence_rhythm: z.enum(["short_punchy", "flowing", "mixed"]),
  emotional_tone: z.enum([
    "warm",
    "direct",
    "inspirational",
    "matter_of_fact",
  ]),
  storytelling_style: z.enum(["narrative", "anecdotal", "analytical"]),
  common_phrases: z.array(z.string()).min(1),
  topics_they_return_to: z.array(z.string()).min(1),
  energy_level: z.enum(["calm", "enthusiastic", "intense"]),
  malaysia_context: z.boolean(),
  languages_mixed: z.array(z.string()).min(1),
  summary: z.string().min(1),
});

export type VoiceProfileJson = z.infer<typeof voiceProfileJsonSchema>;
