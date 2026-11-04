import type { CreatorHeart } from "@veolms/contracts";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { useRef } from "react";
import { celebrateLike } from "../components/likeFeedback";
import { DiscussionAvatar } from "./DiscussionAvatar";

/** The creator's heart is always this red, whatever the theme's accent. */
const HEART_RED = "text-[#ff3b5c]";

/**
 * The creator's heart on a comment, as on a video comment: the avatar of
 * whoever gave it with a small red heart on its corner. To those who can give
 * hearts it is also the button: an outlined heart until given, the badge
 * after, and a press on the badge takes the heart back.
 */
export function CreatorHeartButton({
  heart,
  canGive,
  onToggle,
  size = "md",
}: {
  heart: CreatorHeart | null | undefined;
  canGive: boolean;
  onToggle?: (give: boolean) => void;
  size?: "sm" | "md";
}) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const avatarSize = size === "sm" ? "size-5" : "size-6";
  const avatarPixels = size === "sm" ? 20 : 24;

  if (!heart && !canGive) return null;

  const label = heart
    ? `Hearted by ${heart.displayName}`
    : "Give a creator heart";

  const badge = heart ? (
    <span ref={badgeRef} className="relative inline-grid">
      <DiscussionAvatar
        src={heart.avatarUrl}
        className={`${avatarSize} border-0 ring-2 ring-(--card-surface,var(--surface))`}
        width={avatarPixels}
        height={avatarPixels}
        loading="lazy"
      />
      <Heart
        weight="fill"
        aria-hidden="true"
        className={`absolute -right-1.5 -bottom-1 size-3.5 ${HEART_RED} drop-shadow-[0_0_1.5px_var(--card-surface,var(--surface))]`}
      />
    </span>
  ) : (
    <span ref={badgeRef} className="relative inline-grid">
      <Heart aria-hidden="true" className="size-[18px]" />
    </span>
  );

  if (!canGive) {
    return (
      <span
        title={label}
        aria-label={label}
        role="img"
        className="inline-flex h-8 items-center px-1"
      >
        {badge}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={Boolean(heart)}
      aria-label={heart ? `${label}. Remove the heart` : label}
      title={heart ? `${label} (press to remove)` : "Heart this comment"}
      onClick={(event) => {
        event.stopPropagation();
        const give = !heart;
        onToggle?.(give);
        if (give && badgeRef.current) {
          badgeRef.current.classList.add(HEART_RED);
          celebrateLike(badgeRef.current);
        }
      }}
      className={`inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full px-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) ${
        heart
          ? "hover:bg-[color-mix(in_srgb,#ff3b5c_12%,transparent)]"
          : "text-(--muted) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[#ff3b5c]"
      }`}
    >
      {badge}
    </button>
  );
}

/** "Pinned by the creator", above a comment kept at the top of its lesson. */
export function PinnedLabel({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium text-(--muted) ${className}`}
    >
      <PushPin weight="fill" aria-hidden="true" className="size-3.5" />
      Pinned
    </span>
  );
}
