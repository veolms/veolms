import type { CourseOverviewResponse } from "@veolms/contracts";

export type CourseAccessValidity = NonNullable<
  CourseOverviewResponse["accessValidity"]
>;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "1 year", "6 months", "45 days": the largest whole unit the days make. */
function formatDays(days: number) {
  if (days % 365 === 0) return plural(days / 365, "year");
  if (days % 30 === 0) return plural(days / 30, "month");
  return plural(days, "day");
}

/**
 * How long the course stays with a learner, as the curriculum says it: the
 * learner's own end date once they are enrolled, otherwise what the course
 * gives everyone. Null when the course says nothing about it.
 */
export function courseValidityLabel(
  validity: CourseAccessValidity | null | undefined,
  /** The enrolled learner's end date; null when theirs does not end. */
  enrolment?: { accessExpiresAt: string | null } | null,
): string | null {
  if (enrolment) {
    if (enrolment.accessExpiresAt) {
      const ends = new Date(enrolment.accessExpiresAt);
      if (!Number.isNaN(ends.getTime())) {
        return `Access until ${ends.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`;
      }
    }
    return validity ? "Lifetime access" : null;
  }
  if (!validity) return null;
  switch (validity.durationType) {
    case "lifetime":
      return "Lifetime access";
    case "fixed_duration":
      return validity.durationDays
        ? `${formatDays(validity.durationDays)} of access`
        : null;
    case "custom_expiration":
      return "Limited-time access";
  }
}
