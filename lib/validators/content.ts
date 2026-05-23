import { z } from "zod";
import { CONTENT_TYPES, PLATFORMS } from "@/lib/content/prompt-builder";

export const platformSchema = z.enum(PLATFORMS);

export const generateContentSchema = z.object({
  platform: platformSchema,
  contentType: z.string().min(1).max(100),
  userTopic: z.string().max(200).optional().default(""),
}).refine((value) => CONTENT_TYPES[value.platform].includes(value.contentType), {
  message: "Unsupported content type for platform",
  path: ["contentType"],
});

export const checkContentSchema = z.object({
  draftId: z.string().uuid(),
  userDraft: z.string().min(1).max(10000),
});

export const exportContentSchema = z.object({
  draftId: z.string().uuid(),
});

export const draftsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
