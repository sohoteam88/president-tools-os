"use client";

import { CONTENT_TYPES, type Platform } from "@/lib/content/prompt-builder";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

export const CONTENT_TYPE_KEY_MAP: Record<string, keyof TranslationKeys> = {
  lifestyle_story: "lifestyleStory",
  product_experience: "productExperience",
  team_culture: "teamCulture",
  results_journey: "resultsJourney",
  caption_lifestyle: "captionLifestyle",
  caption_product: "captionProduct",
  caption_results: "captionResults",
  caption_invitation: "captionInvitation",
  personal_message: "personalMessage",
  group_announcement: "groupAnnouncement",
  follow_up: "followUp",
  day_in_life: "dayInLife",
  transformation_story: "transformationStory",
  product_demo_script: "productDemoScript",
  why_i_joined: "whyIJoined",
  event_invite: "eventInvite",
  zoom_call_invite: "zoomCallInvite",
  coffee_chat_invite: "coffeeChatInvite",
};

export function ContentTypeSelector({
  platform,
  value,
  onChange,
}: {
  platform: Platform;
  value: string;
  onChange: (contentType: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      {CONTENT_TYPES[platform].map((type) => {
        const key = CONTENT_TYPE_KEY_MAP[type];
        const label = key ? t[key] : type;
        return (
          <option key={type} value={type}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
