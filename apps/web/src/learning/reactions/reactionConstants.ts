import type { ComponentType } from "react";
import type { DiscussionReactionType } from "@veolms/contracts";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { HandsClappingIcon as HandsClapping } from "@phosphor-icons/react/HandsClapping";
import { HandshakeIcon as Handshake } from "@phosphor-icons/react/Handshake";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { LightbulbIcon as Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { SmileyIcon as Smiley } from "@phosphor-icons/react/Smiley";

export interface ReactionConfig {
  type: DiscussionReactionType;
  label: string;
  icon: ComponentType<{
    size?: number;
    weight?: "regular" | "fill" | "bold";
    className?: string;
  }>;
  colorClass: string;
  badgeColorClass: string;
  emoji: string;
}

export const REACTION_CONFIGS: Record<DiscussionReactionType, ReactionConfig> =
  {
    like: {
      type: "like",
      label: "Like",
      icon: ThumbsUp,
      colorClass: "text-[var(--reaction-like)]",
      badgeColorClass:
        "bg-[color-mix(in_srgb,var(--reaction-like)_16%,transparent)] text-[var(--reaction-like)]",
      emoji: "👍",
    },
    celebrate: {
      type: "celebrate",
      label: "Celebrate",
      icon: HandsClapping,
      colorClass: "text-[var(--reaction-celebrate)]",
      badgeColorClass:
        "bg-[color-mix(in_srgb,var(--reaction-celebrate)_16%,transparent)] text-[var(--reaction-celebrate)]",
      emoji: "👏",
    },
    support: {
      type: "support",
      label: "Support",
      icon: Handshake,
      colorClass: "text-[var(--reaction-support)]",
      badgeColorClass:
        "bg-[color-mix(in_srgb,var(--reaction-support)_16%,transparent)] text-[var(--reaction-support)]",
      emoji: "🤝",
    },
    love: {
      type: "love",
      label: "Love",
      icon: Heart,
      colorClass: "text-[var(--reaction-love)]",
      badgeColorClass:
        "bg-[color-mix(in_srgb,var(--reaction-love)_16%,transparent)] text-[var(--reaction-love)]",
      emoji: "❤️",
    },
    insightful: {
      type: "insightful",
      label: "Insightful",
      icon: Lightbulb,
      colorClass: "text-[var(--reaction-insightful)]",
      badgeColorClass:
        "bg-[color-mix(in_srgb,var(--reaction-insightful)_16%,transparent)] text-[var(--reaction-insightful)]",
      emoji: "💡",
    },
    funny: {
      type: "funny",
      label: "Funny",
      icon: Smiley,
      colorClass: "text-[var(--reaction-funny)]",
      badgeColorClass:
        "bg-[color-mix(in_srgb,var(--reaction-funny)_16%,transparent)] text-[var(--reaction-funny)]",
      emoji: "😂",
    },
  };

export const REACTION_TYPES: DiscussionReactionType[] = [
  "like",
  "celebrate",
  "support",
  "love",
  "insightful",
  "funny",
];

export function getReactionConfig(type?: string | null): ReactionConfig {
  if (type && type in REACTION_CONFIGS) {
    return REACTION_CONFIGS[type as DiscussionReactionType];
  }
  return REACTION_CONFIGS.like;
}
