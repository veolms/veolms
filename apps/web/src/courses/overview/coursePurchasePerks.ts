import type { Icon } from "@phosphor-icons/react";
import {
  DEFAULT_COURSE_INCLUDES,
  type CourseIncludeKind,
} from "@veolms/contracts";
import { COURSE_NOT_RECORDED } from "../courseAdapter";
import {
  FALLBACK_INCLUDE_COLOR,
  courseIncludeGlyph,
  courseIncludeIconWeight,
} from "../includes/courseIncludeIcons";

/** One line of "This course includes" in the price card. */
export interface CoursePurchasePerk {
  title: string;
  /** A quieter line under the title. */
  detail?: string;
  icon: Icon;
  /** Duotone, or a plain outline for an icon whose fill is a box. */
  iconWeight?: "duotone" | "regular";
  /**
   * The icon's colour; its square is a soft tint of the same. From the
   * sidebar's palette (`shell/navigation.ts`); Discussions keeps its green.
   */
  tone: string;
}

/** The green box under the list, for a course that is paid for. */
export interface CoursePurchaseGuarantee {
  title: string;
  detail: string;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** A stored "This course includes" line, as the overview carries it. */
export interface CourseIncludeLine {
  text: string;
  detail?: string | null;
  icon?: string | null;
  color?: string | null;
  kind?: CourseIncludeKind;
}

/**
 * The words of the line about the course's video, from its curriculum: its
 * length, lessons and sections, or, for a course with no video yet, the
 * sections planned (its lessons are not final).
 */
export function videoIncludeWords({
  duration,
  lessons,
  sections,
}: {
  duration?: string;
  lessons: number;
  sections: number;
}): { title: string; detail: string } {
  const notRecorded = !duration || duration === COURSE_NOT_RECORDED;
  if (notRecorded) {
    return {
      title: "On-demand video",
      detail: [
        COURSE_NOT_RECORDED,
        sections > 0 ? `${plural(sections, "section")} planned` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const contents = [
    lessons > 0 ? plural(lessons, "lesson") : null,
    sections > 0 ? `in ${plural(sections, "section")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    title: `${duration} of on-demand video`,
    detail: contents ? `${contents}, at your pace` : "Learn at your own pace",
  };
}

/** How long a course stays with a learner, as its access rule says. */
export interface CourseAccessValidity {
  durationType: "lifetime" | "fixed_duration" | "custom_expiration";
  durationDays?: number | null;
}

/** "2 years", "6 months", "3 weeks", "45 days": the largest whole unit. */
function accessLength(days: number) {
  if (days % 365 === 0) return plural(days / 365, "year");
  if (days % 30 === 0) return plural(days / 30, "month");
  if (days % 7 === 0) return plural(days / 7, "week");
  return plural(days, "day");
}

/**
 * The title of the line about access, from the course's access rule (the
 * editor's Access rules step): "2 years of access", "Lifetime access". Null
 * when the course has no rule yet; the line's stored words stand then.
 */
export function accessIncludeTitle(
  validity: CourseAccessValidity | null | undefined,
): string | null {
  if (!validity) return null;
  switch (validity.durationType) {
    case "lifetime":
      return "Lifetime access";
    case "fixed_duration":
      return validity.durationDays && validity.durationDays > 0
        ? `${accessLength(validity.durationDays)} of access`
        : null;
    case "custom_expiration":
      return "Limited-time access";
  }
}

/**
 * What the price card says comes with a course, under the button: the
 * course's own "This course includes" lines, in its order, with their icons
 * and colours (the course editor's Extras tab). The line about the video is
 * written from the curriculum, and the title of the line about access from
 * the course's access rule. A page built before lines were stored (no
 * `courseIncludes`) gets the standard lines every course starts with.
 */
export function getCoursePurchasePerks({
  duration,
  lessons,
  sections,
  courseIncludes,
  accessValidity,
}: {
  duration?: string;
  lessons: number;
  sections: number;
  courseIncludes?: readonly CourseIncludeLine[];
  accessValidity?: CourseAccessValidity | null;
}): CoursePurchasePerk[] {
  const lines = courseIncludes ?? DEFAULT_COURSE_INCLUDES;
  return lines.map((line) => {
    const words =
      line.kind === "video"
        ? videoIncludeWords({ duration, lessons, sections })
        : {
            title:
              (line.kind === "access"
                ? accessIncludeTitle(accessValidity)
                : null) ?? line.text,
            detail: line.detail ?? undefined,
          };
    return {
      title: words.title,
      detail: words.detail || undefined,
      icon: courseIncludeGlyph(line.icon),
      iconWeight: courseIncludeIconWeight(line.icon),
      tone: line.color || FALLBACK_INCLUDE_COLOR,
    };
  });
}

export const coursePurchaseGuarantee: CoursePurchaseGuarantee = {
  title: "30-day money-back guarantee",
  detail: "Not the right fit? Get a full refund within 30 days.",
};

/** Said under the button of a course that is paid for. */
export const coursePurchaseCheckoutNote =
  "Secure checkout · UPI, cards, net banking";

/** The same for a buyer outside India, who pays in dollars by card. */
export const coursePurchaseCheckoutNoteInternational =
  "Secure checkout · cards";
