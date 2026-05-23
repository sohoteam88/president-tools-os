"use client";

import { cn } from "@/lib/utils";
import { PLATFORMS, type Platform } from "@/lib/content/prompt-builder";
import { useLanguage } from "@/lib/i18n";

const platformIcons: Record<Platform, string> = {
  facebook: "📘",
  instagram: "📸",
  whatsapp: "💬",
  tiktok_script: "🎬",
  invitation: "🤝",
};

export function PlatformSelector({
  value,
  onChange,
}: {
  value: Platform;
  onChange: (platform: Platform) => void;
}) {
  const { t } = useLanguage();

  const labels: Record<Platform, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    tiktok_script: t.tiktokScript,
    invitation: t.invitationLabel,
  };

  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORMS.map((platform) => (
        <button
          key={platform}
          type="button"
          onClick={() => onChange(platform)}
          className={cn(
            "rounded-full border px-3 py-2 text-sm font-medium transition-colors",
            value === platform
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-accent"
          )}
        >
          <span className="mr-1.5">{platformIcons[platform]}</span>
          {labels[platform]}
        </button>
      ))}
    </div>
  );
}
