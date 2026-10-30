import type { DatabaseExecutor } from "@veolms/database";

import * as enrollmentRepository from "./enrollment.repository.ts";

export interface EnrollmentAudienceService {
  listActiveUserIdsForCourse(courseId: string): Promise<string[]>;
}

export function createEnrollmentAudienceService({
  database,
}: {
  database: DatabaseExecutor;
}): EnrollmentAudienceService {
  return {
    listActiveUserIdsForCourse: (courseId) =>
      enrollmentRepository.listActiveUserIdsByCourseId(database, courseId),
  };
}
