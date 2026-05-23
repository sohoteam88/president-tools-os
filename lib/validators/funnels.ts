import { z } from "zod";
import { funnelContentSchema } from "@/lib/funnels/types";

export const FUNNEL_TYPES = [
  "wellness_story",
  "business_story",
  "event_rsvp",
  "free_resource",
] as const;
export type FunnelType = (typeof FUNNEL_TYPES)[number];

export const CTA_TYPES = ["whatsapp", "custom_url", "thank_you"] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "mail",
  "ftp",
  "smtp",
  "support",
  "help",
  "blog",
  "shop",
  "store",
  "about",
]);

export const accountSlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(30, "Slug must be 30 characters or less")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Slug must be lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen."
  )
  .refine((slug) => !RESERVED_SLUGS.has(slug), "That name is reserved");

export const pathSlugSchema = z
  .string()
  .max(50)
  .regex(/^[a-z0-9-]*$/)
  .default("");

export const funnelUpsertSchema = z.object({
  title: z.string().min(1).max(100),
  funnelType: z.enum(FUNNEL_TYPES),
  pathSlug: pathSlugSchema,
  contentJson: funnelContentSchema,
  ctaType: z.enum(CTA_TYPES),
  ctaValue: z.string().max(500).optional(),
  whatsappPreFill: z.string().max(300).optional(),
});

export const funnelUpdateSchema = funnelUpsertSchema.partial();
export const setSlugSchema = z.object({ slug: accountSlugSchema });
export const aiAssistSchema = z.object({ funnelType: z.enum(FUNNEL_TYPES) });
export const leadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const updateLeadSchema = z.object({
  notes: z.string().max(1000).optional(),
  contactedAt: z.string().datetime().optional(),
});
export const publicLeadSchema = z.object({
  funnelId: z.string().uuid(),
  accountSlug: z.string().min(1),
  pathSlug: z.string().max(50).optional().default(""),
  name: z.string().min(1).max(100),
  whatsappNumber: z.string().min(8).max(20),
  email: z.string().email().optional(),
  pdpaConsent: z.literal(true, {
    errorMap: () => ({ message: "You must consent to data collection to continue." }),
  }),
});

export { funnelContentSchema };
