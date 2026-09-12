import type {
  LearningProgressBatchRequest,
  LearningProgressCourseParams,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { LearningProgressService } from "./learning-progress.service.ts";

export function createLearningProgressController({
  service,
}: {
  service: LearningProgressService;
}) {
  async function get(
    request: FastifyRequest<{ Params: LearningProgressCourseParams }>,
  ) {
    return await service.getProgress(
      { id: request.user!.id, roles: request.user!.roles },
      request.params.courseKey,
    );
  }

  async function sync(
    request: FastifyRequest<{
      Params: LearningProgressCourseParams;
      Body: LearningProgressBatchRequest;
    }>,
  ) {
    return await service.syncProgress(
      { id: request.user!.id, roles: request.user!.roles },
      request.params.courseKey,
      request.body,
    );
  }

  return { get, sync };
}

export type LearningProgressController = ReturnType<
  typeof createLearningProgressController
>;
