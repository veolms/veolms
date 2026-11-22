/**
 * The badge beside a team member's name in chat, discussions and profile.
 * Their own title ("Lead Engineer", "Mentor") wins; without one, the role's
 * default. Staff without a title are "ProCodrr Team", never "Staff".
 */
export const TEAM_DEFAULT_BADGE = "ProCodrr Team";

const ROLE_BADGE: Record<string, string> = {
  admin: "Admin",
  instructor: "Instructor",
  staff: TEAM_DEFAULT_BADGE,
  helper: "Helper",
};

/** Undefined for learners (and unknown roles): they carry no badge. */
export function teamBadge(
  role: string | null | undefined,
  title?: string | null,
): string | undefined {
  if (!role) return undefined;
  const fallback = ROLE_BADGE[role];
  if (!fallback) return undefined;
  return title?.trim() || fallback;
}

/**
 * A discussion author's badge: their own title, else "Instructor" for
 * instructors (discussions have always badged only them).
 */
export function discussionBadge(author: {
  role?: string | null;
  title?: string | null;
}): string | undefined {
  return (
    author.title?.trim() ||
    (author.role === "Instructor" ? "Instructor" : undefined)
  );
}
