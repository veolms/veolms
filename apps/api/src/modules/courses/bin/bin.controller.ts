import type { DeletedCoursesQuery } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { CourseBinService } from "./bin.service.ts";

export function createCourseBinController({
  service,
}: {
  service: CourseBinService;
}) {
  async function listDeletedCourses(
    request: FastifyRequest<{ Querystring: DeletedCoursesQuery }>,
  ) {
    return await service.listDeletedCourses(
      request.query.limit,
      request.query.cursor,
    );
  }

  async function restoreCourse(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return await service.restoreCourse(request.params.id);
  }

  return { listDeletedCourses, restoreCourse };
}

export type CourseBinController = ReturnType<typeof createCourseBinController>;
