import React, { useEffect, useRef } from "react";
import type { DiscussionReactionType } from "@veolms/contracts";
import { REACTION_CONFIGS, REACTION_TYPES } from "./reactionConstants";

interface ReactionPickerProps {
  currentReaction?: DiscussionReactionType | null;
  onSelect: (reaction: DiscussionReactionType) => void;
  onClose: () => void;
  position?: "top" | "bottom";
}

export function ReactionPicker({
  currentReaction,
  onSelect,
  onClose,
  position = "top",
}: ReactionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Reactions"
      data-reaction-picker
      className={`absolute left-0 z-50 flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) px-2 py-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 ${
        position === "top" ? "bottom-full mb-2" : "top-full mt-2"
      }`}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      {REACTION_TYPES.map((type) => {
        const config = REACTION_CONFIGS[type];
        const Icon = config.icon;
        const isSelected = currentReaction === type;

        return (
          <button
            key={type}
            type="button"
            aria-label={config.label}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(type);
            }}
            className={`group relative flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-150 hover:scale-125 focus-visible:outline-2 focus-visible:outline-(--accent) ${
              isSelected
                ? "bg-(--surface-sunken) scale-110"
                : "hover:bg-(--surface-sunken)"
            }`}
          >
            <span
              className={`${config.colorClass} flex items-center justify-center`}
            >
              <Icon size={22} weight={isSelected ? "fill" : "bold"} />
            </span>

            {/* Tooltip on hover */}
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-md bg-(--surface-inverted,#0f172a) px-2 py-0.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-100 group-hover:opacity-100">
              {config.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
