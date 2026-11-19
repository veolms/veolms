import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import type { DiscussionReactionType } from "@veolms/contracts";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import {
  celebrateLike,
  playLikeSound,
  prefersReducedMotion,
} from "../components/likeFeedback";
import { getReactionConfig } from "../learning/reactions/reactionConstants";
import { ReactionPicker } from "../learning/reactions/ReactionPicker";

/**
 * The like button of the Discussions page: the thumb and the count alone
 * (0 included), with support for LinkedIn-style reactions on hover/long-press.
 */
export function DiscussionLikeButton({
  liked,
  userReaction,
  count,
  onToggle,
  noun = "",
  iconSize = 15,
}: {
  liked: boolean;
  userReaction?: DiscussionReactionType | null;
  count: number;
  onToggle: (liked: boolean, reaction?: DiscussionReactionType) => void;
  noun?: string;
  iconSize?: number;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [keyboardFocusedPicker, setKeyboardFocusedPicker] = useState(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isTouchRef = useRef(false);
  const touchMovedRef = useRef(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const rollRef = useRef<"up" | "down" | null>(null);
  const shown = Math.max(0, count);

  const activeReaction: DiscussionReactionType | null =
    userReaction ?? (liked ? "like" : null);
  const isReacted = Boolean(activeReaction);
  const activeConfig = getReactionConfig(activeReaction);
  const ActiveIcon = isReacted ? activeConfig.icon : ThumbsUp;

  // The number rolls in from below when it goes up and from above when it
  // goes down, after the press that changed it.
  useLayoutEffect(() => {
    const direction = rollRef.current;
    rollRef.current = null;
    if (!direction || !numberRef.current || prefersReducedMotion()) return;
    numberRef.current.animate(
      [
        {
          transform: `translateY(${direction === "up" ? 70 : -70}%)`,
          opacity: 0,
        },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [shown]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  const handleMouseEnter = () => {
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
    if (!touchMovedRef.current && isTouchRef.current) {
      setShowPicker((prev) => !prev);
    }
    touchStartPos.current = null;
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.detail > 1) return;

    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(closeTimer.current);

    if (isTouchRef.current) {
      isTouchRef.current = false;
      return;
    }

    if (showPicker) {
      setShowPicker(false);
      return;
    }

    const willLike = !liked;
    rollRef.current = willLike ? "up" : "down";
    if (willLike) {
      playLikeSound();
      if (iconRef.current) celebrateLike(iconRef.current);
      onToggle(true, "like");
    } else {
      onToggle(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setKeyboardFocusedPicker(true);
      setShowPicker(true);
    }
  };

  const handleSelectReaction = (reaction: DiscussionReactionType) => {
    setShowPicker(false);
    setKeyboardFocusedPicker(false);
    buttonRef.current?.focus();

    if (activeReaction === reaction) {
      rollRef.current = "down";
      onToggle(false);
    } else {
      rollRef.current = isReacted ? null : "up";
      playLikeSound();
      if (iconRef.current) celebrateLike(iconRef.current);
      onToggle(true, reaction);
    }
  };

  const target = noun ? ` ${noun}` : "";
  const ariaLabel = `${liked ? `Remove ${activeConfig.label} reaction` : "Like"}${target}, ${shown} ${
    shown === 1 ? "like" : "likes"
  }`;

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={isReacted}
        aria-label={ariaLabel}
        data-comment-like
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) ${
          isReacted
            ? activeConfig.colorClass
            : "text-(--muted) hover:text-(--text)"
        }`}
      >
        <span ref={iconRef} className="relative inline-grid place-items-center">
          <ActiveIcon
            size={iconSize}
            weight={isReacted ? "fill" : "regular"}
            aria-hidden="true"
          />
        </span>
        <span className="inline-flex overflow-hidden">
          <span
            ref={numberRef}
            className="inline-block min-w-[1ch] text-center tabular-nums"
          >
            {shown}
          </span>
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
