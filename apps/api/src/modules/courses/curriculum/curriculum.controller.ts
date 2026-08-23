import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateCourseSectionRequest,
  UpdateCourseSectionRequest,
  ReorderSectionsRequest,
  CreateCourseLessonRequest,
  UpdateCourseLessonRequest,
  ReorderLessonsRequest,
  CreateLessonResourceRequest,
} from "@veolms/contracts";
import type { CurriculumService } from "./curriculum.service.ts";

export function createCurriculumController({
  service,
}: {
  service: CurriculumService;
}) {
  // --- Sections ---

  async function createCourseSection(
    request: FastifyRequest<{
      Params: { id: string };
      Body: CreateCourseSectionRequest;
    }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    const { title, description } = request.body;

    const section = await service.createCourseSection(
      id,
      creatorId,
      title,
      description,
    );
    reply.code(201);
    return section;
  }

  async function updateCourseSection(
    request: FastifyRequest<{
      Params: { id: string; sectionId: string };
      Body: UpdateCourseSectionRequest;
    }>,
  ) {
    const { id, sectionId } = request.params;
    const creatorId = request.user!.id;
    const { title, description } = request.body;

    return await service.updateCourseSection(
      id,
      sectionId,
      creatorId,
      title,
      description,
    );
  }

  async function deleteCourseSection(
    request: FastifyRequest<{ Params: { id: string; sectionId: string } }>,
  ) {
    const { id, sectionId } = request.params;
    const creatorId = request.user!.id;

    return await service.deleteCourseSection(id, sectionId, creatorId);
  }

  async function reorderCourseSections(
    request: FastifyRequest<{
      Params: { id: string };
      Body: ReorderSectionsRequest;
    }>,
  ) {
    const { id } = request.params;
    const creatorId = request.user!.id;
    const { orderedSectionIds, version } = request.body;

    return await service.reorderCourseSections(
      id,
      creatorId,
      orderedSectionIds,
      version,
    );
  }

  // --- Lessons ---

  async function createCourseLesson(
    request: FastifyRequest<{
      Params: { id: string; sectionId: string };
      Body: CreateCourseLessonRequest;
    }>,
    reply: FastifyReply,
  ) {
    const { id, sectionId } = request.params;
    const creatorId = request.user!.id;

    const lesson = await service.createCourseLesson(
      id,
      sectionId,
      creatorId,
      request.body,
    );
    reply.code(201);
    return lesson;
  }

  async function updateCourseLesson(
    request: FastifyRequest<{
      Params: { id: string; lessonId: string };
      Body: UpdateCourseLessonRequest;
    }>,
    reply: FastifyReply,
  ) {
    const { id, lessonId } = request.params;
    const creatorId = request.user!.id;

    const result = await service.updateCourseLesson(
      id,
      lessonId,
      creatorId,
      request.body,
      request.log,
    );

    if (result.accepted) {
      reply.code(202);
      return {
        videoJobId: result.videoJobId,
        processingStatus: result.processingStatus,
      };
    }

    return { success: true };
  }

  async function deleteCourseLesson(
    request: FastifyRequest<{ Params: { id: string; lessonId: string } }>,
  ) {
    const { id, lessonId } = request.params;
    const creatorId = request.user!.id;

    return await service.deleteCourseLesson(id, lessonId, creatorId);
  }

  async function reorderSectionLessons(
    request: FastifyRequest<{
      Params: { id: string; sectionId: string };
      Body: ReorderLessonsRequest;
    }>,
  ) {
    const { id, sectionId } = request.params;
    const creatorId = request.user!.id;
    const { orderedLessonIds, version } = request.body;

    return await service.reorderSectionLessons(
      id,
      sectionId,
      creatorId,
      orderedLessonIds,
      version,
    );
  }

  // --- Lesson Resources ---

  async function addLessonResource(
    request: FastifyRequest<{
      Params: { id: string; lessonId: string };
      Body: CreateLessonResourceRequest;
    }>,
    reply: FastifyReply,
  ) {
    const { id, lessonId } = request.params;
    const creatorId = request.user!.id;

    const resource = await service.addLessonResource(
      id,
      lessonId,
      creatorId,
      request.body,
    );
    reply.code(201);
    return resource;
  }

  async function removeLessonResource(
    request: FastifyRequest<{ Params: { id: string; resourceId: string } }>,
  ) {
    const { id, resourceId } = request.params;
    const creatorId = request.user!.id;

    return await service.removeLessonResource(id, resourceId, creatorId);
  }

  return {
    createCourseSection,
    updateCourseSection,
    deleteCourseSection,
    reorderCourseSections,
    createCourseLesson,
    updateCourseLesson,
    deleteCourseLesson,
    reorderSectionLessons,
    addLessonResource,
    removeLessonResource,
  };
}

export type CurriculumController = ReturnType<typeof createCurriculumController>;
