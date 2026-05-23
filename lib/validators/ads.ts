import { z } from "zod";

export const PLATFORMS = [
  "facebook",
  "instagram",
  "tiktok",
  "whatsapp_status",
  "other",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp_status: "WhatsApp Status",
  other: "Other",
};

const optionalPositiveInt = z.number().int().nonnegative().optional().nullable();

export const AdEntrySchema = z.object({
  platform: z.enum(PLATFORMS),
  contentDraftId: z.string().uuid().optional().nullable(),
  captionPreview: z.string().max(200).optional().nullable(),
  postedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  reach: optionalPositiveInt,
  likes: optionalPositiveInt,
  comments: optionalPositiveInt,
  saves: optionalPositiveInt,
  shares: optionalPositiveInt,
  dmsReceived: optionalPositiveInt,
  leadsGenerated: optionalPositiveInt,
  linkClicks: optionalPositiveInt,
  notes: z.string().max(500).optional().nullable(),
});

export const UpdateAdEntrySchema = AdEntrySchema.partial();

export const ScreenshotUploadSchema = z.object({
  entryId: z.string().uuid(),
  mimeType: z.enum(["image/jpeg", "image/png"]),
});

export const ConfirmScreenshotSchema = z.object({
  key: z.string().min(1),
});
