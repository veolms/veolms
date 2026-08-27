import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateCourseRequest,
  UpdateCourseBasicsRequest,
  CourseSlugParams,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import type { CourseService } from "./course.service.ts";

export function createCourseController({
  service,
}: {
  service: CourseService;
}) {
  async function listCourses(
    request: FastifyRequest<{
      Querystring: { creatorId?: string };
    }>,
  ) {
    const courses = await service.listPublishedCourses({
      creatorId: request.query.creatorId,
    });
    return { courses };
  }

  async function getCourseBySlug(
    request: FastifyRequest<{ Params: CourseSlugParams }>,
    reply: FastifyReply,
  ) {
    const course = await service.getPublishedCourseBySlug(request.params.slug);

    if (!course) {
      return reply
        .code(404)
        .send(
          httpError(
            404,
            "COURSE_NOT_FOUND",
            `No published course exists with slug "${request.params.slug}".`,
          ),
        );
    }

    return course;
  }

  async function listCreatorCourses(
    request: FastifyRequest<{ Params: { creatorId: string } }>,
  ) {
    const { creatorId } = request.params;
    return await service.listAvailableCoursesByCreator(creatorId);
  }

  async function createCourse(
    request: FastifyRequest<{ Body: CreateCourseRequest }>,
    reply: FastifyReply,
  ) {
    const payload = request.body;
    const creatorId = request.user!.id;
    const course = await service.createCourse(payload, creatorId);
    reply.code(201);
    return course;
  }

  async function listMyCourses(request: FastifyRequest) {
    const creatorId = request.user!.id;
    return await service.listMyCourses(creatorId);
  }

  async function getCourseEditor(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.getCourseEditorData(id, creatorId);
  }

  async function updateCourseBasics(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateCourseBasicsRequest;
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    const result = await service.updateCourseBasics(
      id,
      creatorId,
      request.body,
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

  async function getCourseOverview(
    request: FastifyRequest<{
      Params: { idOrSlug: string };
    }>,
  ) {
    const { idOrSlug } = request.params;
    const user = request.user
      ? { id: request.user.id, roles: request.user.roles }
      : undefined;
    return await service.getCourseOverviewData(idOrSlug, user);
  }

  async function deleteCourse(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
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
