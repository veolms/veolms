import type {
  LearningProgressBatchRequest,
  LearningProgressCourseParams,
  UpdateLearningGoalSettingsRequest,
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

  async function getResumeContext(
    request: FastifyRequest<{ Params: LearningProgressCourseParams }>,
  ) {
    return await service.getResumeContext(
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

  async function getSummary(request: FastifyRequest) {
    return await service.getSummary({
      id: request.user!.id,
      roles: request.user!.roles,
    });
  }

  async function getGoalSettings(request: FastifyRequest) {
    return await service.getGoalSettings({
      id: request.user!.id,
      roles: request.user!.roles,
    });
  }

  async function updateGoalSettings(
    request: FastifyRequest<{ Body: UpdateLearningGoalSettingsRequest }>,
  ) {
    return await service.updateGoalSettings(
      { id: request.user!.id, roles: request.user!.roles },
      request.body,
    );
  }

  return {
    get,
    getResumeContext,
    sync,
    getSummary,
    getGoalSettings,
    updateGoalSettings,
  };
}

export type LearningProgressController = ReturnType<
  typeof createLearningProgressController
>;
