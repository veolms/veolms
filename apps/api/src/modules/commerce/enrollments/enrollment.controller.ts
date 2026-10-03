import type { FastifyRequest } from "fastify";
import type { AcademyEnrollmentListQuery } from "@veolms/contracts";
import type { EnrollmentService } from "./enrollment.service.ts";

export function createEnrollmentController({ service }: { service: EnrollmentService }) {
  async function listEnrolledCourses(request: FastifyRequest) {
    const userId = request.user!.id;
    const courses = await service.listEnrolledCourses(userId);
    return { courses };
  }

  async function listAcademyEnrollments(
    request: FastifyRequest<{ Querystring: AcademyEnrollmentListQuery }>,
  ) {
    const items = await service.listAcademyEnrollments(request.query.limit);
    return { items };
  }

  return { listEnrolledCourses, listAcademyEnrollments };
}
