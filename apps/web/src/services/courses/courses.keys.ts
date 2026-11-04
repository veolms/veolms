export const courseKeys = {
  all: ["courses"] as const,
  lists: () => [...courseKeys.all, "list"] as const,
  pagedLists: (filters: { limit: number; search: string; sort: string }) =>
    [...courseKeys.lists(), "paged", filters] as const,
  mine: () => [...courseKeys.all, "mine"] as const,
  details: () => [...courseKeys.all, "detail"] as const,
  detail: (slug: string) => [...courseKeys.details(), slug] as const,
  overviews: () => [...courseKeys.all, "overview"] as const,
  overview: (idOrSlug: string) =>
    [...courseKeys.overviews(), idOrSlug] as const,
  // Under the overviews: whatever makes a course overview stale (a
  // curriculum edit, signing in or out) makes a lesson's description stale.
  lessonDescription: (courseId: string, lessonId: string) =>
    [
      ...courseKeys.overviews(),
      courseId,
      "lesson-description",
      lessonId,
    ] as const,
  // Under the overviews too: signing in or out, the Student view and a
  // course edit change what the viewer may do with it.
  access: (idOrSlug: string) =>
    [...courseKeys.overviews(), idOrSlug, "access"] as const,
  accessList: () => [...courseKeys.overviews(), "access-list"] as const,
  // Under the overviews too, so a course edit makes them stale.
  publicCurriculum: (idOrSlug: string) =>
    [...courseKeys.overviews(), idOrSlug, "public-curriculum"] as const,
  // Never stale: a version names one curriculum for good.
  // `null`: the copy the site was built with, whatever its version.
  staticCurriculum: (courseSlug: string, version: string | null) =>
    [...courseKeys.all, "static-curriculum", courseSlug, version] as const,
  editor: (id: string) => [...courseKeys.all, "editor", id] as const,
  preview: (id: string) => [...courseKeys.all, "preview", id] as const,
  validation: (id: string) => [...courseKeys.all, "validation", id] as const,
  staticPageRefresh: (id: string) =>
    [...courseKeys.all, "static-page-refresh", id] as const,
  categories: () => [...courseKeys.all, "categories"] as const,
  options: () => [...courseKeys.lists(), "options"] as const,
  bin: () => [...courseKeys.all, "bin"] as const,
  linkedCourses: (id: string) =>
    [...courseKeys.all, "linked-courses", id] as const,
  partialAccess: (id: string) =>
    [...courseKeys.all, "partial-access", id] as const,
  partialAccessOptions: () =>
    [...courseKeys.all, "partial-access-options"] as const,
  offer: (idOrSlug: string, offerSlug: string) =>
    [...courseKeys.all, "offer", idOrSlug, offerSlug] as const,
};
