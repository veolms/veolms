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
  const closeTimer = useRef<number | undefined>(undefined);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isTouchRef = useRef(false);
  const touchMovedRef = useRef(false);
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
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!canParticipate) return;
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setShowPicker(true);
    }, 280);
  };

  const handleMouseLeave = () => {
    window.clearTimeout(hoverTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setShowPicker(false);
    }, 250);
  };

  const handlePickerMouseEnter = () => {
    window.clearTimeout(closeTimer.current);
  };

  const handlePickerMouseLeave = () => {
    setShowPicker(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!canParticipate) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchMovedRef.current = false;
    isTouchRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > 10 || dy > 10) {
      touchMovedRef.current = true;
      touchStartPos.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (!canParticipate) return;
    if (!touchMovedRef.current && isTouchRef.current) {
      // Direct touch on mobile immediately reveals all reactions so user can react
      setShowPicker((prev) => !prev);
    }
    touchStartPos.current = null;
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canParticipate) {
      e.stopPropagation();
      onParticipationRequired?.();
      return;
    }

    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(closeTimer.current);

    // If this click was triggered by a touch interaction, the touch handler already toggled the picker.
    if (isTouchRef.current) {
      isTouchRef.current = false;
      return;
    }

    if (showPicker) {
      setShowPicker(false);
      return;
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
        onTouchMove={handleTouchMove}
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
          anchorRef={buttonRef}
          currentReaction={activeReaction}
          onSelect={handleSelectReaction}
          onClose={() => {
            setShowPicker(false);
            setKeyboardFocusedPicker(false);
            buttonRef.current?.focus();
          }}
          onMouseEnter={handlePickerMouseEnter}
          onMouseLeave={handlePickerMouseLeave}
          autoFocusFirst={keyboardFocusedPicker}
        />
      )}
    </div>
  );
}
