import type { FastifyRequest } from "fastify";
import type {
  AcademyEnrollmentListQuery,
  UnenrollCourseParams,
  UnenrollCourseResponse,
} from "@veolms/contracts";
import type { EnrollmentService } from "./enrollment.service.ts";

export function createEnrollmentController({
  service,
}: {
  service: EnrollmentService;
}) {
  async function listEnrolledCourses(request: FastifyRequest) {
    const userId = request.user!.id;
    const courses = await service.listEnrolledCourses(
      userId,
      request.user!.roles,
    );
    return { courses };
  }

  async function listAcademyEnrollments(
    request: FastifyRequest<{ Querystring: AcademyEnrollmentListQuery }>,
  ) {
    const items = await service.listAcademyEnrollments(request.query.limit, {
      id: request.user!.id,
      roles: request.user!.roles,
    });
    return { items };
  }

  async function unenrollFromCourse(
    request: FastifyRequest<{ Params: UnenrollCourseParams }>,
  ): Promise<UnenrollCourseResponse> {
    const { courseId } = request.params;
    await service.unenrollFromFreeCourse(request.user!.id, courseId);
    return { courseId };
  }

  return { listEnrolledCourses, listAcademyEnrollments, unenrollFromCourse };
}
