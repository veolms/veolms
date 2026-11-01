import type {
  LearningProgressBatchRequest,
  LearningProgressCourseParams,
  UpdateLearningGoalSettingsRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { isLearnerViewRequest } from "../../lib/learner-view.ts";
import type { SessionService } from "../auth/index.ts";

import type { LearningProgressService } from "./learning-progress.service.ts";

export function createLearningProgressController({
  service,
  sessionService,
}: {
  service: LearningProgressService;
  sessionService: SessionService;
}) {
  async function get(
    request: FastifyRequest<{ Params: LearningProgressCourseParams }>,
  ) {
    return await service.getProgress(
      {
        id: request.user!.id,
        roles: request.user!.roles,
        learnerView: isLearnerViewRequest(request),
      },
      request.params.courseKey,
    );
  }

  async function getResumeContext(
    request: FastifyRequest<{ Params: LearningProgressCourseParams }>,
  ) {
    return await service.getResumeContext(
      {
        id: request.user!.id,
        roles: request.user!.roles,
        learnerView: isLearnerViewRequest(request),
      },
      request.params.courseKey,
    );
  }

  async function sync(
    request: FastifyRequest<{
      Params: LearningProgressCourseParams;
      Body: LearningProgressBatchRequest;
    }>,
  ) {
    const synced = await service.syncProgress(
      {
        id: request.user!.id,
        roles: request.user!.roles,
        learnerView: isLearnerViewRequest(request),
      },
      request.params.courseKey,
      request.body,
    );
    // reportPlayback is best-effort: a transient database error (lock-wait
    // timeout, connection blip) must not fail the heartbeat after
    // syncProgress has already committed progress and watch time. The client
    // would otherwise restore those seconds and count them again on retry.
    // The contract treats an absent playback field as allowed.
    try {
      const playback = await sessionService.reportPlayback(
        {
          id: request.user!.id,
          roles: request.user!.roles,
          email: request.user!.email,
        },
        request.session!.id,
        request.body.playing,
      );
      return { ...synced, playback };
    } catch (error) {
      request.log.error(
        { err: error },
        "reportPlayback failed; returning synced progress without playback",
      );
      return { ...synced };
    }
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
