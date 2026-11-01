import type { FastifyRequest } from "fastify";
import type { AddLinkedCourseRequest } from "@veolms/contracts";
import type { LinksService } from "./links.service.ts";

export function createLinksController({ service }: { service: LinksService }) {
  async function listLinkedCourses(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const items = await service.listLinkedCourses(
      request.params.id,
      request.user!,
    );
    return { items };
  }

  async function addLinkedCourse(
    request: FastifyRequest<{
      Params: { id: string };
      Body: AddLinkedCourseRequest;
    }>,
  ) {
    const items = await service.addLinkedCourse(
      request.params.id,
      request.body.linkedCourseId,
      request.user!,
    );
    return { items };
  }

  async function removeLinkedCourse(
    request: FastifyRequest<{
      Params: { id: string; linkedCourseId: string };
    }>,
  ) {
    const items = await service.removeLinkedCourse(
      request.params.id,
      request.params.linkedCourseId,
      request.user!,
    );
    return { items };
  }

  return { listLinkedCourses, addLinkedCourse, removeLinkedCourse };
}
