import type { FastifyReply, FastifyRequest } from "fastify";
import type { UpdateCourseBasicsRequest } from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import type { CourseService } from "./course.service.ts";

export function createCourseController({
  service,
}: {
  service: CourseService;
}) {
  async function listCourses(request: FastifyRequest) {
    const { creatorId } = request.query as { creatorId?: string };
    const courses = await service.listPublishedCourses({ creatorId });
    return { courses };
  }

  async function getCourseBySlug(request: FastifyRequest, reply: FastifyReply) {
    const { slug } = request.params as { slug: string };
    const course = await service.getPublishedCourseBySlug(slug);

    if (!course) {
      return reply
        .code(404)
        .send(
          httpError(
            404,
            "COURSE_NOT_FOUND",
            `No published course exists with slug "${slug}".`,
          ),
        );
    }

    return course;
  }

  async function listCreatorCourses(request: FastifyRequest) {
    const { creatorId } = request.params as { creatorId: string };
    return await service.listAvailableCoursesByCreator(creatorId);
  }

  async function createCourse(request: FastifyRequest, reply: FastifyReply) {
    const payload = request.body as {
      title: string;
      slug?: string;
      categoryId?: string;
    };
    const creatorId = request.user!.id;
    const course = await service.createCourse(payload, creatorId);
    reply.code(201);
    return course;
  }

  async function listMyCourses(request: FastifyRequest) {
    const creatorId = request.user!.id;
    return await service.listMyCourses(creatorId);
  }

  async function getCourseEditor(request: FastifyRequest) {
    const { id } = request.params as { id: string };
    const creatorId = request.user!.id;
    return await service.getCourseEditorData(id, creatorId);
  }

  async function updateCourseBasics(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const { id } = request.params as { id: string };
    const creatorId = request.user!.id;
    const result = await service.updateCourseBasics(
      id,
      creatorId,
      request.body as UpdateCourseBasicsRequest,
      request.log,
    );

    if (result.accepted) {
      reply.code(202);
      return {
        videoJobId: result.videoJobId,
        processingStatus: result.processingStatus,
        version: result.version,
      };
    }

    return result.course;
  }

  async function getCourseOverview(request: FastifyRequest) {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const user = request.user
      ? { id: request.user.id, roles: request.user.roles }
      : undefined;
    return await service.getCourseOverviewData(idOrSlug, user);
  }

  async function deleteCourse(request: FastifyRequest) {
    const { id } = request.params as { id: string };
    const creatorId = request.user!.id;
    return await service.deleteCourse(id, creatorId);
  }

  return {
    listCourses,
    getCourseBySlug,
    listCreatorCourses,
    createCourse,
    listMyCourses,
    getCourseEditor,
    updateCourseBasics,
    getCourseOverview,
    deleteCourse,
  };
}

export type CourseController = ReturnType<typeof createCourseController>;
