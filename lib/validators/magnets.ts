import { z } from "zod";

export const MagnetMetaSchema = z.object({
  title: z.string().min(5, "Title too short").max(120, "Title too long"),
  description: z.string().min(10, "Description too short").max(400, "Description too long"),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
});

export const MagnetDownloadRequestSchema = z.object({
  accountSlug: z.string().min(3).max(30),
  accountLeadMagnetId: z.string().uuid(),
  name: z.string().min(1, "Name required").max(100),
  whatsappNumber: z.string().min(8, "WhatsApp number too short").max(20),
  email: z.string().email().optional().or(z.literal("")),
  pdpaConsent: z.literal(true, {
    errorMap: () => ({ message: "You must consent to data collection to continue." }),
  }),
});

export const MagnetDownloadQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
