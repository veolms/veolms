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
      colorClass: "text-blue-500",
      badgeColorClass: "bg-blue-500/15 text-blue-500",
      emoji: "👍",
    },
    celebrate: {
      type: "celebrate",
      label: "Celebrate",
      icon: HandsClapping,
      colorClass: "text-emerald-500",
      badgeColorClass: "bg-emerald-500/15 text-emerald-500",
      emoji: "👏",
    },
    support: {
      type: "support",
      label: "Support",
      icon: Handshake,
      colorClass: "text-purple-500",
      badgeColorClass: "bg-purple-500/15 text-purple-500",
      emoji: "🤝",
    },
    love: {
      type: "love",
      label: "Love",
      icon: Heart,
      colorClass: "text-rose-500",
      badgeColorClass: "bg-rose-500/15 text-rose-500",
      emoji: "❤️",
    },
    insightful: {
      type: "insightful",
      label: "Insightful",
      icon: Lightbulb,
      colorClass: "text-amber-500",
      badgeColorClass: "bg-amber-500/15 text-amber-500",
      emoji: "💡",
    },
    funny: {
      type: "funny",
      label: "Funny",
      icon: Smiley,
      colorClass: "text-cyan-500",
      badgeColorClass: "bg-cyan-500/15 text-cyan-500",
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
