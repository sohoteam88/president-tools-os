import { z } from "zod";
import { OBJECTION_CATEGORIES } from "@/lib/objections/types";

export const TONES = ["empathetic", "logical", "story"] as const;
export type Tone = (typeof TONES)[number];

export const ResponseSchema = z.object({
  category: z.enum(OBJECTION_CATEGORIES),
  title: z.string().min(3, "Title too short").max(80, "Title too long"),
  responseText: z.string().min(50, "Response must be at least 50 characters").max(500, "Response must be under 500 characters"),
  tone: z.enum(TONES).default("empathetic"),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const DraftRequestSchema = z.object({
  category: z.enum(OBJECTION_CATEGORIES),
  specificObjection: z.string().max(200).optional(),
});

export const FavouriteSchema = z.object({
  responseId: z.string().uuid(),
  action: z.enum(["add", "remove"]),
});

export const UseAsContentSchema = z.object({
  responseId: z.string().uuid(),
  responseType: z.enum(["master", "personal"]),
});
