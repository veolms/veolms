export type CourseDetailsLevel =
  "beginner" | "intermediate" | "advanced" | "all_levels";

/**
 * The stored difficulty a details update asks for:
 *
 * - a level: the course is given it;
 * - `"all_levels"`: the course has no single level, which is stored as no
 *   level at all (`null`), the way the course model means it;
 * - `undefined`: no level was sent, so the stored one is left as it is.
 *
 * `"all_levels"` used to be skipped by the write like a level that was not
 * sent: the request answered 200 and the course kept its level.
 */
export function resolveDetailsLevelUpdate(
  level: CourseDetailsLevel | undefined,
): Exclude<CourseDetailsLevel, "all_levels"> | null | undefined {
  if (level === undefined) return undefined;
  return level === "all_levels" ? null : level;
}
