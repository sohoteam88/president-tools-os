"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { FunnelContent } from "@/lib/funnels/types";
import type { FunnelType } from "@/lib/validators/funnels";

const FUNNEL_OPTIONS: Array<{
  type: FunnelType;
  title: string;
  description: string;
}> = [
  {
    type: "wellness_story",
    title: "Wellness Story",
    description: "Share a personal health journey and collect interested leads.",
  },
  {
    type: "business_story",
    title: "Business Story",
    description: "Invite prospects to learn why you chose the business path.",
  },
  {
    type: "event_rsvp",
    title: "Event RSVP",
    description: "Create a simple registration page for a talk, Zoom, or event.",
  },
  {
    type: "free_resource",
    title: "Free Resource",
    description: "Offer a lead magnet and capture follow-up details.",
  },
];

const DEFAULT_CONTENT: Record<FunnelType, FunnelContent> = {
  wellness_story: {
    headline: "My simple wellness story",
    subheadline: "A short personal page for people who want to understand what changed for me.",
    storyBlocks: [
      {
        type: "paragraph",
        text: "I started with small daily choices and learned that consistency matters more than perfection. This page is a simple place to share my story and invite a calm conversation.",
      },
    ],
    leadForm: {
      heading: "Want to know more?",
      subheading: "Leave your details and I will follow up personally.",
      fields: ["name", "whatsapp", "email"],
      submitLabel: "Send me details",
    },
  },
  business_story: {
    headline: "Why I started building differently",
    subheadline: "A personal introduction for people curious about the business side.",
    storyBlocks: [
      {
        type: "paragraph",
        text: "I wanted a more flexible way to grow, learn, and serve people. This page shares the beginning of that journey and opens the door for a respectful conversation.",
      },
    ],
    leadForm: {
      heading: "Curious about the story?",
      subheading: "Share your details and I will send you the next step.",
      fields: ["name", "whatsapp", "email"],
      submitLabel: "I am interested",
    },
  },
  event_rsvp: {
    headline: "Join my next sharing session",
    subheadline: "A simple RSVP page for people who want to learn more in a relaxed setting.",
    storyBlocks: [
      {
        type: "paragraph",
        text: "This session is designed to answer questions clearly and help you decide whether this is relevant for your goals. There is no pressure, only useful information.",
      },
    ],
    leadForm: {
      heading: "Reserve your spot",
      subheading: "Leave your details and I will confirm the event information.",
      fields: ["name", "whatsapp", "email"],
      submitLabel: "Reserve my spot",
    },
  },
  free_resource: {
    headline: "Get my free wellness resource",
    subheadline: "A practical guide for people who want a simple starting point.",
    storyBlocks: [
      {
        type: "paragraph",
        text: "I created this resource to make the first step easier. Leave your details and I will send it over, then follow up if you have questions.",
      },
    ],
    leadForm: {
      heading: "Send me the resource",
      subheading: "Enter your details to receive the free resource.",
      fields: ["name", "whatsapp", "email"],
      submitLabel: "Get the resource",
    },
  },
};

function pathSlugFor(type: FunnelType) {
  const suffix = Date.now().toString(36).slice(-5);
  return `${type.replaceAll("_", "-")}-${suffix}`;
}

export function NewFunnelPicker() {
  const router = useRouter();
  const [creatingType, setCreatingType] = useState<FunnelType | null>(null);

  async function createFunnel(type: FunnelType) {
    setCreatingType(type);
    const option = FUNNEL_OPTIONS.find((item) => item.type === type);
    const response = await fetch("/api/funnels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: option?.title ?? "New Funnel",
        funnelType: type,
        pathSlug: pathSlugFor(type),
        contentJson: DEFAULT_CONTENT[type],
        ctaType: "thank_you",
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: { funnel?: { id?: string } };
      error?: string;
    };
    setCreatingType(null);

    const funnelId = body.data?.funnel?.id;
    if (!response.ok || !funnelId) {
      toast.error(body.error ?? "Could not create funnel");
      return;
    }

    toast.success("Draft funnel created");
    router.push(`/funnels/${funnelId}/edit`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FUNNEL_OPTIONS.map((option) => (
        <button
          key={option.type}
          type="button"
          onClick={() => void createFunnel(option.type)}
          disabled={creatingType !== null}
          className="rounded-lg border border-border p-4 text-left transition hover:border-primary hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="block font-medium">{option.title}</span>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">{option.description}</span>
          <span className="mt-4 block text-xs font-medium text-primary">
            {creatingType === option.type ? "Creating..." : "Create draft"}
          </span>
        </button>
      ))}
    </div>
  );
}
