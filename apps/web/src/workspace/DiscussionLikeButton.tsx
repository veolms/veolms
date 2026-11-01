import { useLayoutEffect, useRef } from "react";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import {
  celebrateLike,
  playLikeSound,
  prefersReducedMotion,
} from "../components/likeFeedback";
import { DiscussionRowAction } from "./DiscussionRowAction";

/**
 * The like button of the Discussions page: the thumb and the count alone
 * (0 included), with no box around them, as under a lesson video. Liking lifts the thumb with a small burst and a soft sound, and
 * the number rolls to its new value. One digit keeps its place; going to
 * two digits widens the pill.
 */
export function DiscussionLikeButton({
  liked,
  count,
  onToggle,
  noun = "",
  iconSize = 15,
}: {
  liked: boolean;
  count: number;
  onToggle: () => void;
  /** What is liked, for assistive technology ("reply"). */
  noun?: string;
  iconSize?: number;
}) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const rollRef = useRef<"up" | "down" | null>(null);
  const shown = Math.max(0, count);

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

  const press = () => {
    const willLike = !liked;
    rollRef.current = willLike ? "up" : "down";
    if (willLike) {
      playLikeSound();
      if (iconRef.current) celebrateLike(iconRef.current);
    }
    onToggle();
  };

  const target = noun ? ` ${noun}` : "";
  return (
    <DiscussionRowAction
      icon={
        <span ref={iconRef} className="relative inline-grid place-items-center">
          <ThumbsUp
            size={iconSize}
            weight={liked ? "fill" : "regular"}
            aria-hidden="true"
          />
        </span>
      }
      label={
        <span className="inline-flex overflow-hidden">
          <span
            ref={numberRef}
            className="inline-block min-w-[1ch] text-center tabular-nums"
          >
            {shown}
          </span>
        </span>
      }
      ariaLabel={`${liked ? "Unlike" : "Like"}${target}, ${shown} ${
        shown === 1 ? "like" : "likes"
      }`}
      pressed={liked}
      plain
      onClick={press}
    />
  );
}
