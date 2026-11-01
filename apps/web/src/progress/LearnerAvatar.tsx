import type { LearningHistoryLearner } from "@veolms/contracts";
import { useState } from "react";

function initialsOf(learner: LearningHistoryLearner) {
  return (learner.name || learner.username || "L")
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const sizeClasses = {
  md: "size-10 text-xs",
  lg: "size-14 text-base",
} as const;

/**
 * A learner's picture, or their initials when they have none or it does not
 * load: the avatar the Students list draws, at two sizes.
 */
export function LearnerAvatar({
  learner,
  size = "md",
}: {
  learner: LearningHistoryLearner;
  size?: keyof typeof sizeClasses;
}) {
  // Remembered per picture, so a new one is tried afresh.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const pixels = size === "lg" ? 56 : 40;

  if (learner.avatarUrl && failedUrl !== learner.avatarUrl) {
    return (
      <img
        src={learner.avatarUrl}
        alt=""
        width={pixels}
        height={pixels}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(learner.avatarUrl)}
        className={`${sizeClasses[size]} shrink-0 rounded-full border border-(--text)/10 object-cover shadow-xs`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizeClasses[size]} flex shrink-0 items-center justify-center rounded-full border border-(--text)/10 bg-[color-mix(in_srgb,var(--accent)_15%,var(--surface))] font-bold text-(--accent) shadow-xs`}
    >
      {initialsOf(learner)}
    </span>
  );
}
