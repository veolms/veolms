import type { DatabaseExecutor } from "@veolms/database";

import { audienceOf } from "./workshop-links.ts";
import * as repository from "./workshops.repository.ts";

/**
 * Everyone a workshop's notices and invitations go to: its audience (every
 * learner, its course's learners, or its buyers) plus anyone staff added,
 * less those who said they are not going. Each id once.
 */
export async function listWorkshopAudienceUserIds(
  database: DatabaseExecutor,
  workshopId: string,
  listCourseLearnerIds: (courseId: string) => Promise<string[]>,
): Promise<string[]> {
  const info = await repository.findWorkshopAudienceInfo(database, workshopId);
  if (!info) return [];
  const audience = audienceOf(info);
  const [registrants, declined] = await Promise.all([
    repository.listActiveRegistrantUserIds(database, workshopId),
    repository.listDeclinedUserIds(database, workshopId),
  ]);
  const everyone = new Set(registrants);
  if (audience === "everyone") {
    for (const id of await repository.listAllLearnerUserIds(database)) {
      everyone.add(id);
    }
  } else if (audience === "course" && info.course_id) {
    for (const id of await listCourseLearnerIds(info.course_id)) {
      everyone.add(id);
    }
  }
  for (const id of declined) everyone.delete(id);
  return [...everyone];
}

/** Every learner on the platform (see `listAllLearnerUserIds`). */
export async function listAllLearnerUserIds(
  database: DatabaseExecutor,
): Promise<string[]> {
  return await repository.listAllLearnerUserIds(database);
}
