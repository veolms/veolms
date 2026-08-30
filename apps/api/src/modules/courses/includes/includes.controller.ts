import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateCourseIncludeRequest,
  UpdateCourseIncludeRequest,
  ReorderCourseIncludesRequest,
} from "@veolms/contracts";
import type { IncludesService } from "./includes.service.ts";

export function createIncludesController({
  service,
}: {
  service: IncludesService;
}) {
  async function createCourseInclude(
    request: FastifyRequest<{
      Params: { id: string };
      Body: CreateCourseIncludeRequest;
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;

    const item = await service.createCourseInclude(
      id,
      creatorId,
      request.body,
    );
    reply.code(201);
    return item;
  }

  async function listCourseIncludes(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const items = await service.listCourseIncludes(id);
    return { items };
  }

  async function updateCourseInclude(
    request: FastifyRequest<{
      Params: { id: string; includeId: string };
      Body: UpdateCourseIncludeRequest;
    }>,
  ) {
    const { id, includeId } = request.params;
    const creatorId = request.user!.id;

    return await service.updateCourseInclude(
      id,
      includeId,
      creatorId,
      request.body,
    );
  }

  async function deleteCourseInclude(
    request: FastifyRequest<{
      Params: { id: string; includeId: string };
    }>,
  ) {
    const { id, includeId } = request.params;
    const creatorId = request.user!.id;

    return await service.deleteCourseInclude(id, includeId, creatorId);
  }

  async function reorderCourseIncludes(
    request: FastifyRequest<{
      Params: { id: string };
      Body: ReorderCourseIncludesRequest;
    }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    const { orderedIds } = request.body;

    return await service.reorderCourseIncludes(id, creatorId, orderedIds);
  }

  return {
    createCourseInclude,
    listCourseIncludes,
    updateCourseInclude,
    deleteCourseInclude,
    reorderCourseIncludes,
  };
}

export type IncludesController = ReturnType<typeof createIncludesController>;
