import { z } from "zod";

export const WebinarMetaSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(10).max(500),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  durationSeconds: z.number().int().positive().max(14400).optional(),
});

export const AdminWebinarSchema = WebinarMetaSchema.extend({
  bunnyVideoId: z.string().min(8, "Invalid Bunny.net video ID"),
});

export const WebinarRegistrationSchema = z.object({
  accountSlug: z.string().min(3).max(30),
  accountWebinarId: z.string().uuid(),
  name: z.string().min(1).max(100),
  whatsappNumber: z.string().min(8).max(20),
  email: z.string().email().optional().or(z.literal("")),
  pdpaConsent: z.literal(true, {
    errorMap: () => ({ message: "You must consent to data collection to continue." }),
  }),
});

export const WebinarCustomIntroSchema = z.object({
  customIntro: z.string().max(300).optional().or(z.literal("")),
});

export const WebinarRegistrationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
