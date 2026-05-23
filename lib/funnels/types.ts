import { z } from "zod";

export type StoryBlock =
  | { type: "paragraph"; text: string }
  | { type: "highlight"; text: string }
  | { type: "image"; url: string; alt: string };

export type SocialProofItem = {
  name: string;
  quote: string;
  result?: string;
};

export type FunnelContent = {
  headline: string;
  subheadline: string;
  coverImageUrl?: string;
  storyBlocks: StoryBlock[];
  leadForm: {
    heading: string;
    subheading?: string;
    fields: ("name" | "whatsapp" | "email")[];
    submitLabel: string;
  };
  socialProof?: SocialProofItem[];
};

export const funnelContentSchema = z.object({
  headline: z.string().min(5).max(100),
  subheadline: z.string().min(5).max(200),
  coverImageUrl: z.string().url().optional(),
  storyBlocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("paragraph"), text: z.string().min(10).max(1000) }),
        z.object({ type: z.literal("highlight"), text: z.string().min(5).max(300) }),
        z.object({ type: z.literal("image"), url: z.string().url(), alt: z.string().max(100) }),
      ])
    )
    .min(1)
    .max(8),
  leadForm: z.object({
    heading: z.string().min(3).max(80),
    subheading: z.string().max(150).optional(),
    fields: z.array(z.enum(["name", "whatsapp", "email"])).min(1),
    submitLabel: z.string().min(2).max(40),
  }),
  socialProof: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        quote: z.string().min(5).max(200),
        result: z.string().max(100).optional(),
      })
    )
    .max(3)
    .optional(),
});

export function extractFunnelText(content: FunnelContent): string {
  const parts = [
    content.headline,
    content.subheadline,
    ...content.storyBlocks
      .filter((block) => block.type !== "image")
      .map((block) => block.text),
    content.leadForm.heading,
    content.leadForm.subheading ?? "",
    ...(content.socialProof?.map((item) => `${item.quote} ${item.result ?? ""}`) ?? []),
  ];
  return parts.join(" ");
}
