import { cacheTags } from "./cache/tags.ts";

/**
 * Which requests change what the site's static pages show (the course
 * pages, the catalogue, the home page, the platform's look), so the pages
 * must be built again.
 *
 * - `course`: one course's details, curriculum, price, access rule or what
 *   is included changed.
 * - `site`: something every page draws from changed (platform settings,
 *   the home page, the academy's brand, the category list), or a video's
 *   length may have, and with it a course's (which course is not known
 *   from the request).
 */
export type SiteContentChange =
  { scope: "course"; courseId: string } | { scope: "site"; reason: string };

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** `/courses/<uuid>` or `/bin/courses/<uuid>` at the start of the path. */
const COURSE_PATH = new RegExp(`^/(?:bin/)?courses/(${UUID})(?:/|$)`, "iu");

/**
 * Course routes whose writes are learner activity or staff conversation, not
 * the course: discussions, notes, moderation, quizzes and their attempts.
 * They are made all day by learners and must not rebuild anything.
 */
const COURSE_ACTIVITY_SEGMENT =
  /\/(threads|replies|discussions|notes|notes-overview|moderation|reports|quiz-assignment|quiz-assignments|quiz-pricing|quiz-analytics|attempts)(\/|$)/iu;

/** Site-wide changes, by route pattern (without the `/v1` prefix). */
const SITE_ROUTES: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\/platform\/settings$/u, reason: "platform settings" },
  { pattern: /^\/home\/page-settings$/u, reason: "home page" },
  { pattern: /^\/academy\/brand(\/|$)/u, reason: "academy brand" },
  { pattern: /^\/categories(\/|$)/u, reason: "categories" },
  { pattern: /^\/webhooks\/mediaconvert$/u, reason: "video transcode" },
  {
    pattern: /^\/media\/[^/]+\/(upload-complete|transcode\/retry)$/u,
    reason: "video upload",
  },
];

function withoutPrefix(path: string): string {
  return path.replace(/^\/v1(?=\/)/u, "").split("?")[0] ?? "";
}

/**
 * The change a finished request made to what the static pages show, or
 * null. Ask it only of a request that succeeded.
 *
 * `routeUrl` is the matched route's pattern (`/v1/courses/:courseId/...`):
 * the course is read from the request's own path, and only for routes that
 * begin at the course, so a route that merely names a course further along
 * (`/access/users/:userId/courses/:courseId`, a learner leaving it under
 * `/enrollments/courses/:courseId`) is not mistaken for a change to it.
 */
export function detectSiteContentChange(request: {
  method: string;
  url: string;
  routeUrl: string | undefined;
  /** The signed-in user's roles, when there is one. */
  userRoles?: readonly string[];
}): SiteContentChange | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return null;
  const route = withoutPrefix(request.routeUrl ?? "");
  const path = withoutPrefix(request.url);
  if (!route) return null;

  if (route.includes("static-page-refresh")) return null;

  const courseId = COURSE_PATH.exec(path)?.[1];
  if (courseId && /^\/(?:bin\/)?courses\/:/u.test(route)) {
    if (COURSE_ACTIVITY_SEGMENT.test(path)) return null;
    return { scope: "course", courseId: courseId.toLowerCase() };
  }

  for (const { pattern, reason } of SITE_ROUTES) {
    if (pattern.test(route)) return { scope: "site", reason };
  }

  // A course's instructor is shown by their display name. Only staff
  // teach, so a learner editing their profile changes no page.
  if (
    route === "/auth/me" &&
    request.method.toUpperCase() === "PATCH" &&
    request.userRoles?.some((role) => {
      const name = role.trim().toLowerCase();
      return name === "admin" || name === "instructor";
    })
  ) {
    return { scope: "site", reason: "instructor profile" };
  }

  return null;
}

/**
 * The cache tags a change clears: a course's own entries and the course
 * lists, or for a site-wide change everything pages draw from.
 */
export function cacheTagsForSiteContentChange(
  change: SiteContentChange,
): string[] {
  return change.scope === "course"
    ? [cacheTags.course(change.courseId), cacheTags.catalog]
    : [cacheTags.site, cacheTags.catalog];
}
