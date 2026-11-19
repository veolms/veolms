import React, { useRef, useState, useEffect } from "react";
import type { DiscussionReactionType } from "@veolms/contracts";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { cheerLike } from "../../components/likeFeedback";
import { getReactionConfig } from "./reactionConstants";
import { ReactionPicker } from "./ReactionPicker";

interface ReactionButtonProps {
  liked?: boolean;
  userReaction?: DiscussionReactionType | null;
  count: number;
  canParticipate?: boolean;
  onParticipationRequired?: () => void;
  onToggle: (liked: boolean, reaction?: DiscussionReactionType) => void;
  noun?: string;
  iconSize?: number;
  className?: string;
}

export function ReactionButton({
  liked = false,
  userReaction,
  count,
  canParticipate = true,
  onParticipationRequired,
  onToggle,
  noun = "",
  iconSize = 18,
  className = "",
}: ReactionButtonProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [keyboardFocusedPicker, setKeyboardFocusedPicker] = useState(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressHandledRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Active reaction: if userReaction is set, use it. Otherwise, if liked, default to "like".
  const activeReaction: DiscussionReactionType | null =
    userReaction ?? (liked ? "like" : null);
  const isReacted = Boolean(activeReaction);
  const activeConfig = getReactionConfig(activeReaction);
  const ActiveIcon = isReacted ? activeConfig.icon : ThumbsUp;

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(longPressTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!canParticipate) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setShowPicker(true);
    }, 280);
  };

  const handleMouseLeave = () => {
    window.clearTimeout(hoverTimer.current);
  };

  const handleTouchStart = () => {
    if (!canParticipate) return;
    longPressHandledRef.current = false;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressHandledRef.current = true;
      setShowPicker(true);
    }, 400);
  };

  const handleTouchEnd = () => {
    window.clearTimeout(longPressTimer.current);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canParticipate) {
      e.stopPropagation();
      onParticipationRequired?.();
      return;
    }

    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(longPressTimer.current);

    // If this click is a touch compatibility click after a recognized long press,
    // consume it without toggling like.
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }

    if (showPicker) {
      setShowPicker(false);
    }

    if (isReacted) {
      // Already reacted -> unlike
      onToggle(false);
    } else {
      // Not reacted -> like
      if (buttonRef.current) cheerLike(buttonRef.current);
      onToggle(true, "like");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!canParticipate) {
        onParticipationRequired?.();
        return;
      }
      setKeyboardFocusedPicker(true);
      setShowPicker(true);
    }
  };

  const handleSelectReaction = (reaction: DiscussionReactionType) => {
    setShowPicker(false);
    setKeyboardFocusedPicker(false);
    buttonRef.current?.focus();
    if (activeReaction === reaction) {
      // Re-selecting current reaction toggles it off
      onToggle(false);
    } else {
      if (buttonRef.current) cheerLike(buttonRef.current);
      onToggle(true, reaction);
    }
  };

  const target = noun ? ` ${noun}` : "";
  const ariaLabel = isReacted
    ? `Remove ${activeConfig.label} reaction${target}`
    : `React${target}`;

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-pressed={isReacted}
        aria-label={ariaLabel}
        data-comment-like
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${
          isReacted ? activeConfig.colorClass : "text-(--muted)"
        } ${className}`}
      >
        <span
          data-like-icon
          className="relative inline-grid place-items-center transition-transform active:scale-125"
        >
          <ActiveIcon
            size={iconSize}
            weight={isReacted ? "fill" : "regular"}
            aria-hidden="true"
          />
        </span>
        <span className="text-xs font-medium sm:text-sm">
          {isReacted ? activeConfig.label : "Like"}
        </span>
      </button>

      {showPicker && (
        <ReactionPicker
          currentReaction={activeReaction}
          onSelect={handleSelectReaction}
          onClose={() => {
            setShowPicker(false);
            setKeyboardFocusedPicker(false);
            buttonRef.current?.focus();
          }}
          autoFocusFirst={keyboardFocusedPicker}
        />
      )}
    </div>
  );
}
