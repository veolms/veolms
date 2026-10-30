import type { Icon } from "@phosphor-icons/react";
import { Archive } from "@phosphor-icons/react/Archive";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import type { Course } from "../catalogue";

/**
 * Each status: an icon, the name, its colour, and what it means for
 * learners (the tooltip).
 */
const statusDetails: Record<
  Course["lifecycleStatus"],
  { label: string; icon: Icon; tone: string; meaning: string }
> = {
  draft: {
    label: "Draft",
    icon: EyeSlash,
    tone: "bg-amber-500/14 text-amber-600 [:root:not([data-theme=light])_&]:text-amber-300",
    meaning: "Not visible to learners",
  },
  published: {
    label: "Published",
    icon: Eye,
    // The theme's own colour, so it is not read as a second saving beside
    // the green one.
    tone: "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent))",
    meaning: "Visible to learners",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    tone: "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted)",
    meaning: "Hidden from learners",
  },
};

/**
 * The course's status for someone who manages it, after the price's saving
 * in the manager's bar and in the same shape as that tag: whether learners
 * can see the course.
 */
export function CourseStatusTag({
  status,
  className = "",
}: {
  status: Course["lifecycleStatus"];
  className?: string;
}) {
  const details = statusDetails[status];
  const StatusIcon = details.icon;
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.8rem] leading-none font-bold whitespace-nowrap ${details.tone} ${className}`}
      title={details.meaning}
    >
      {/* Centred beside the words; the tag takes its baseline from them,
          so it stands on the price's baseline as the saving does. It
          reaches into the padding rather than making the tag taller than
          the saving (14px against the words' 12.8px). */}
      <StatusIcon
        size={14}
        weight="bold"
        className="-my-1 self-center"
        aria-hidden="true"
      />
      {details.label}
      <span className="sr-only">: {details.meaning.toLowerCase()}</span>
    </span>
  );
}
