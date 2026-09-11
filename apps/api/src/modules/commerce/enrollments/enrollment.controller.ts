import type { FastifyRequest } from "fastify";
import type { EnrollmentService } from "./enrollment.service.ts";

export function createEnrollmentController({
  service,
}: {
  service: EnrollmentService;
}) {
  async function listEnrolledCourses(request: FastifyRequest) {
    const userId = request.user!.id;
    const courses = await service.listEnrolledCourses(userId);
    return { courses };
  }

  return { listEnrolledCourses };
}
