import { cacheTags, createCache } from "@veolms/api-core";
import type { DatabaseExecutor as Executor } from "@veolms/database";

import * as repo from "./authorization.repository.ts";

/**
 * Which course a guarded route's course, lesson or section belongs to: one
 * query before every course-scoped permission check. A lesson or section
 * never moves to another course, and a course keeps its id; entries are
 * labelled with the course so deleting it (or changing its slug) clears
 * them. Not-found answers are not kept: the record may be created next.
 */
const SCOPE_TTL_MS = 5 * 60_000;

const scopes = createCache<string | null>({
  name: "authorization.resource-course",
  ttlMs: SCOPE_TTL_MS,
  maxEntries: 50_000,
  maxBytes: 4 * 1024 * 1024,
});

export type ScopedResource = "course" | "lesson" | "section";

const resolvers: Record<
  ScopedResource,
  (
    database: Executor,
    id: string,
  ) => Promise<{ courseId: string | null } | null>
> = {
  course: repo.resolveCourseScope,
  lesson: repo.resolveLessonScope,
  section: repo.resolveSectionScope,
};

/** The id of the course the resource belongs to, or null if not found. */
export async function resolveResourceCourseId(
  database: Executor,
  resource: ScopedResource,
  resourceId: string,
): Promise<string | null> {
  const load = async () =>
    (await resolvers[resource](database, resourceId))?.courseId ?? null;
  if (database.isTransaction) return await load();
  return await scopes.fetch(`${resource}:${resourceId}`, load, {
    tagsOf: (courseId) => (courseId ? [cacheTags.course(courseId)] : []),
    keepIf: (courseId) => courseId !== null,
  });
}
