import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import * as curriculumRepo from "./curriculum.repository.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Which of the given ids a course, lesson or lesson-resource description
 * mentions. Other modules ask this before removing stored files they own, so
 * a file a description links to is never removed. Read-only.
 *
 * An id that is not a plain UUID is reported as mentioned: it is not
 * searched for, and "kept" is the safe answer for something unchecked.
 */
export async function findIdsMentionedInCourseContent(
  database: Kysely<Database>,
  ids: readonly string[],
): Promise<string[]> {
  const unchecked = ids.filter((id) => !UUID_PATTERN.test(id.toLowerCase()));
  const searchable = ids
    .map((id) => id.toLowerCase())
    .filter((id) => UUID_PATTERN.test(id));

  const mentioned = await curriculumRepo.findIdsMentionedInCourseContent(
    database,
    searchable,
  );
  return [...unchecked, ...mentioned];
}
