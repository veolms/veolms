import type { FastifyRequest } from "fastify";
import type { LifecycleService } from "./lifecycle.service.ts";

export function createLifecycleController({
  service,
}: {
  service: LifecycleService;
}) {
  async function getCourseValidationIssues(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;

    return await service.validateCourse(id, creatorId, request.user?.roles);
  }

  async function publishCourse(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.publishCourse(id, creatorId, request.user?.roles);
  }

  async function unpublishCourse(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.unpublishCourse(id, creatorId, request.user?.roles);
  }

  async function previewCourseDraft(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.previewCourseDraft(id, creatorId, request.user?.roles);
  }

  return {
    getCourseValidationIssues,
    publishCourse,
    unpublishCourse,
    previewCourseDraft,
  };
}

export type LifecycleController = ReturnType<typeof createLifecycleController>;
