import type { WorkshopPublishIssue } from "@veolms/contracts";

/**
 * What a draft needs before learners may see it. Pure, so the admin form
 * can show the same list the publish button checks.
 */
export function workshopPublishIssues(
  workshop: {
    title: string;
    summary: string | null;
    priceMinor: number | null;
    currency: string;
  },
  sessions: readonly {
    startsAt: Date | string;
    endsAt: Date | string;
    joinUrl: string | null;
  }[],
  now: Date = new Date(),
): WorkshopPublishIssue[] {
  const issues: WorkshopPublishIssue[] = [];
  if (workshop.title.trim().length < 3) {
    issues.push({ field: "title", message: "Give the workshop a title." });
  }
  if (!workshop.summary?.trim()) {
    issues.push({
      field: "summary",
      message: "Add a one-line summary; it is what learners see on the card.",
    });
  }
  if (sessions.length === 0) {
    issues.push({ field: "sessions", message: "Add at least one session." });
  } else {
    const future = sessions.some(
      (session) => new Date(session.endsAt).getTime() > now.getTime(),
    );
    if (!future) {
      issues.push({
        field: "sessions",
        message: "Every session is already over. Add or move a session.",
      });
    }
    if (sessions.some((session) => !session.joinUrl)) {
      issues.push({
        field: "joinUrl",
        message: "Every session needs its meeting link.",
      });
    }
  }
  if (
    workshop.priceMinor !== null &&
    workshop.priceMinor > 0 &&
    !/^[A-Z]{3}$/.test(workshop.currency)
  ) {
    issues.push({
      field: "price",
      message: "A paid workshop needs a currency.",
    });
  }
  return issues;
}

/** URL-safe slug from a title; empty when the title has no usable characters. */
export function workshopSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}
