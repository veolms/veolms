import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateCourseRequest,
  UpdateCourseBasicsRequest,
  CourseListQuery,
  CourseSlugParams,
  LessonDescriptionParams,
  CourseStaticPageRefreshStatus,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import { isLearnerViewRequest } from "../../../lib/learner-view.ts";
import type { CourseService } from "./course.service.ts";
import type { CourseStaticPageRefreshService } from "@veolms/services/course-static-pages";

export function createCourseController({
  service,
  staticPages,
}: {
  service: CourseService;
  staticPages?: CourseStaticPageRefreshService;
}) {
  async function listCourses(
    request: FastifyRequest<{
      Querystring: CourseListQuery;
    }>,
  ) {
    return await service.listPublishedCourses(request.query);
  }

  async function listCourseOptions() {
    return await service.listPublishedCourseOptions();
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
    return await service.listMyCourses(creatorId, request.user?.roles);
  }

  async function getCourseEditor(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.getCourseEditorData(
      id,
      creatorId,
      request.user?.roles,
    );
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
      request.user?.roles,
    );

    // 202 tells the editor the new trailer still has to be processed.
    if (result.accepted) {
      reply.code(202);
      return { version: result.version };
    }

    return result.course;
  }

  async function getCourseTrailerPlayback(
    request: FastifyRequest<{ Params: { idOrSlug: string } }>,
  ) {
    const user = request.user
      ? { id: request.user.id, roles: request.user.roles }
      : undefined;
    return await service.getCourseTrailerPlayback(
      request.params.idOrSlug,
      user,
    );
  }

  async function getCourseTrailerPlaybackToken(
    request: FastifyRequest<{ Params: { idOrSlug: string } }>,
  ) {
    const user = request.user
      ? { id: request.user.id, roles: request.user.roles }
      : undefined;
    return await service.getCourseTrailerPlaybackToken(
      request.params.idOrSlug,
      user,
    );
  }

  async function getCourseOverview(
    request: FastifyRequest<{
      Params: { idOrSlug: string };
    }>,
  ) {
    const { idOrSlug } = request.params;
    const user = request.user
      ? {
          id: request.user.id,
          roles: request.user.roles,
          learnerView: isLearnerViewRequest(request),
        }
      : undefined;
    return await service.getCourseOverviewData(idOrSlug, user);
  }

  async function getPublicCurriculum(
    request: FastifyRequest<{ Params: { idOrSlug: string } }>,
  ) {
    return await service.getPublicCurriculum(request.params.idOrSlug);
  }

  async function getLessonDescription(
    request: FastifyRequest<{ Params: LessonDescriptionParams }>,
  ) {
    const { courseId, lessonId } = request.params;
    const user = request.user
      ? {
          id: request.user.id,
          roles: request.user.roles,
          learnerView: isLearnerViewRequest(request),
        }
      : undefined;
    return await service.getLessonDescription(courseId, lessonId, user);
  }

  async function deleteCourse(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    return await service.deleteCourse(id, creatorId, request.user?.roles);
  }

  async function getStaticPageRefreshStatus(
    request: FastifyRequest<{ Params: { id: string } }>,
  ): Promise<CourseStaticPageRefreshStatus> {
    await service.getCourseAndVerifyOwner(
      request.params.id,
      request.user!.id,
      request.user?.roles,
      "course.details.update",
    );
    return (
      staticPages?.getStatus(request.params.id) ?? {
        courseId: request.params.id,
        status: "idle",
        message: null,
        updatedAt: new Date().toISOString(),
        requestId: null,
        runUrl: null,
      }
    );
  }

  async function retryStaticPageRefresh(
    request: FastifyRequest<{ Params: { id: string } }>,
  ): Promise<CourseStaticPageRefreshStatus> {
    await service.getCourseAndVerifyOwner(
      request.params.id,
      request.user!.id,
      request.user?.roles,
      "course.details.update",
    );
    return (
      staticPages?.retry(request.params.id) ??
      getStaticPageRefreshStatus(request)
    );
  }

  async function updateCourseThumbnail(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        thumbnailUrl: string;
        thumbnailMediaId?: string | null;
        version?: number;
      };
    }>,
  ) {
    const { id } = request.params;
    return await service.updateCourseThumbnail(
      id,
      request.user!.id,
      request.user?.roles,
      request.body,
    );
  }

  async function updateCourseDetails(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        title?: string;
        subtitle?: string | null;
        description?: string | null;
        language?: string;
        level?: "beginner" | "intermediate" | "advanced" | "all_levels";
        categoryId?: string | null;
        version?: number;
      };
    }>,
  ) {
    const { id } = request.params;
    return await service.updateCourseDetails(
      id,
      request.user!.id,
      request.user?.roles,
      request.body,
    );
  }

  async function archiveCourse(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params;
    return await service.archiveCourse(
      id,
      request.user!.id,
      request.user?.roles,
    );
  }

  return {
    listCourses,
    listCourseOptions,
    getCourseBySlug,
    listCreatorCourses,
    createCourse,
    listMyCourses,
    getCourseEditor,
    updateCourseBasics,
    updateCourseThumbnail,
    updateCourseDetails,
    archiveCourse,
    getCourseOverview,
    getCourseTrailerPlayback,
    getCourseTrailerPlaybackToken,
    getPublicCurriculum,
    getLessonDescription,
    deleteCourse,
    getStaticPageRefreshStatus,
    retryStaticPageRefresh,
  };
}

export type CourseController = ReturnType<typeof createCourseController>;
