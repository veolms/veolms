import type {
  LearningHistoryQuery,
  UpdateProgressSharingRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { LearningHistoryService } from "./learning-history.service.ts";

export function createLearningHistoryController({
  service,
}: {
  service: LearningHistoryService;
}) {
  const viewerOf = (request: FastifyRequest) => ({
    id: request.user!.id,
    roles: request.user!.roles,
  });

  async function getHistory(
    request: FastifyRequest<{ Querystring: LearningHistoryQuery }>,
  ) {
    return await service.getHistory(viewerOf(request), request.query);
  }

  async function listCommunity(request: FastifyRequest) {
    return await service.listCommunity(viewerOf(request));
  }

  async function updateSharing(
    request: FastifyRequest<{ Body: UpdateProgressSharingRequest }>,
  ) {
    return await service.updateSharing(viewerOf(request), request.body);
  }

  return { getHistory, listCommunity, updateSharing };
}

export type LearningHistoryController = ReturnType<
  typeof createLearningHistoryController
>;
