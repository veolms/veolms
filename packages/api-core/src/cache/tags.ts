/**
 * The words cache entries are labelled with, so that one change clears
 * every entry it affects in every cache: `invalidateCache([cacheTags.course(id)])`
 * after a course is edited clears its overview, its curriculum, its lesson
 * order, wherever they are cached.
 *
 * A tag is `namespace` or `namespace:id`. Ids are lower-cased so a uuid
 * written either way names the same thing. Plugins add their own namespaces
 * (`drm:media:<id>`) without touching this file.
 */

/** Clears every entry of every cache. */
export const ALL_CACHE_TAG = "*";

export const cacheTags = {
  /** Something every page draws from: categories, branding, settings. */
  site: "site",
  /** The academy row (one per installation). */
  academy: "academy",
  /** The rules signing in follows (platform security settings). */
  auth: "auth",
  /** Roles, their permissions, feature flags, menus. */
  rbac: "rbac",
  /** Lists of courses that are the same for everyone. */
  catalog: "catalog",
  course: (courseId: string) => `course:${courseId.toLowerCase()}`,
  user: (userId: string) => `user:${userId.toLowerCase()}`,
  session: (sessionId: string) => `session:${sessionId.toLowerCase()}`,
  media: (mediaId: string) => `media:${mediaId.toLowerCase()}`,
} as const;
