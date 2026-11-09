import type { DatabaseExecutor } from "@veolms/database";

import * as repository from "./workshops.repository.ts";

/**
 * Everyone a workshop's notices go to: its active registrants and, for a
 * workshop of a course, every learner with access to that course (they are
 * in without registering). Each id once.
 */
export async function listWorkshopAudienceUserIds(
  database: DatabaseExecutor,
  workshopId: string,
  listCourseLearnerIds: (courseId: string) => Promise<string[]>,
): Promise<string[]> {
  const [registrants, courseId] = await Promise.all([
    repository.listActiveRegistrantUserIds(database, workshopId),
    repository.findWorkshopCourseId(database, workshopId),
  ]);
  const learners = courseId ? await listCourseLearnerIds(courseId) : [];
  return [...new Set([...registrants, ...learners])];
}

/**
 * Every learner on the platform, for "announce to everyone": holders of the
 * student role in either role system, or anyone with an enrollment, as the
 * Students page counts them. Deleted accounts are left out.
 */
export async function listAllLearnerUserIds(
  database: DatabaseExecutor,
): Promise<string[]> {
  return await repository.listAllLearnerUserIds(database);
}
