import type { LearnerHomeQuery, LearnerHomeResponse } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import { isLearnerViewRequest } from "../../lib/learner-view.ts";
import type { LearnerHomeService } from "./learner-home.service.ts";

export function createLearnerHomeController({
  service,
}: {
  service: LearnerHomeService;
}) {
  async function getLearnerHome(
    request: FastifyRequest<{ Querystring: LearnerHomeQuery }>,
  ): Promise<LearnerHomeResponse> {
    return await service.getLearnerHome(
      {
        id: request.user!.id,
        roles: request.user!.roles,
        learnerView: isLearnerViewRequest(request),
      },
      request.query.pinnedCourseId,
    );
  }

  return { getLearnerHome };
}

export type LearnerHomeController = ReturnType<
  typeof createLearnerHomeController
>;
