import React from "react";
import type { DiscussionReactionType } from "@veolms/contracts";
import { getReactionConfig } from "./reactionConstants";

interface ReactionSummaryBadgeProps {
  topReactions?: DiscussionReactionType[];
  totalCount: number;
  onClick?: () => void;
  className?: string;
}

export function ReactionSummaryBadge({
  topReactions = [],
  totalCount,
  onClick,
  className = "",
}: ReactionSummaryBadgeProps) {
  if (totalCount <= 0) return null;

  // Use top 1-3 reactions or fallback to 'like'
  const displayReactions =
    topReactions.length > 0
      ? topReactions.slice(0, 3)
      : (["like"] as DiscussionReactionType[]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={`View who reacted, ${totalCount} ${
        totalCount === 1 ? "reaction" : "reactions"
      }`}
      title="View who reacted"
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-(--muted) transition-colors hover:bg-(--surface-sunken) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent) ${className}`}
    >
      <span className="flex items-center -space-x-1">
        {displayReactions.map((reaction, idx) => {
          const config = getReactionConfig(reaction);
          const Icon = config.icon;
          return (
            <span
              key={`${reaction}-${idx}`}
              className={`relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-(--surface) bg-(--surface) ${config.colorClass}`}
              style={{ zIndex: displayReactions.length - idx }}
            >
              <Icon size={12} weight="fill" />
            </span>
          );
        })}
      </span>
      <span className="tabular-nums font-semibold">{totalCount}</span>
    </button>
  );
}
