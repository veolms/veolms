import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateLessonChapterRequest,
  UpdateLessonChapterRequest,
} from "@veolms/contracts";
import type { ChaptersService } from "./chapters.service.ts";

export function createChaptersController({
  service,
}: {
  service: ChaptersService;
}) {
  async function listChapters(
    request: FastifyRequest<{
      Params: { courseId: string; lessonId: string };
    }>,
  ) {
    const { courseId, lessonId } = request.params;
    const items = await service.listChapters(
      courseId,
      lessonId,
      request.user!.id,
      request.user?.roles,
    );
    return { items };
  }

  async function createChapter(
    request: FastifyRequest<{
      Params: { courseId: string; lessonId: string };
      Body: CreateLessonChapterRequest;
    }>,
    reply: FastifyReply,
  ) {
    const { courseId, lessonId } = request.params;
    const chapter = await service.createChapter(
      courseId,
      lessonId,
      request.user!.id,
      request.body,
      request.user?.roles,
    );
    reply.code(201);
    return chapter;
  }

  async function updateChapter(
    request: FastifyRequest<{
      Params: { courseId: string; lessonId: string; chapterId: string };
      Body: UpdateLessonChapterRequest;
    }>,
  ) {
    const { courseId, lessonId, chapterId } = request.params;
    return await service.updateChapter(
      courseId,
      lessonId,
      chapterId,
      request.user!.id,
      request.body,
      request.user?.roles,
    );
  }

  async function deleteChapter(
    request: FastifyRequest<{
      Params: { courseId: string; lessonId: string; chapterId: string };
    }>,
  ) {
    const { courseId, lessonId, chapterId } = request.params;
    return await service.deleteChapter(
      courseId,
      lessonId,
      chapterId,
      request.user!.id,
      request.user?.roles,
    );
  }

  return { listChapters, createChapter, updateChapter, deleteChapter };
}

export type ChaptersController = ReturnType<typeof createChaptersController>;
