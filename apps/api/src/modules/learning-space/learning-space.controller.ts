import type {
  LearningSpaceSessionParams,
  UpsertLearningSpaceSessionRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { LearningSpaceService } from "./learning-space.service.ts";

export function createLearningSpaceController({
  service,
}: {
  service: LearningSpaceService;
}) {
  async function list(request: FastifyRequest) {
    return await service.listSessions(request.user!.id);
  }

  async function upsert(
    request: FastifyRequest<{
      Params: LearningSpaceSessionParams;
      Body: UpsertLearningSpaceSessionRequest;
    }>,
  ) {
    return await service.upsertSession(
      { id: request.user!.id, roles: request.user!.roles },
      request.params.courseKey,
      request.body,
    );
  }

  async function close(
    request: FastifyRequest<{ Params: LearningSpaceSessionParams }>,
  ) {
    return await service.closeSession(
      request.user!.id,
      request.params.courseKey,
    );
  }

  return { list, upsert, close };
}

export type LearningSpaceController = ReturnType<
  typeof createLearningSpaceController
>;
