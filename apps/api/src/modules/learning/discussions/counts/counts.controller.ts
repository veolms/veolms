import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type { LessonDiscussionCountsService } from "./counts.service.ts";

export interface LessonDiscussionCountsController {
  getLessonInteractionCounts(
    request: FastifyRequest<{
      Params: { courseId: string; lessonId: string };
    }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createLessonDiscussionCountsController({
  database,
  service,
}: {
  database: DatabaseExecutor;
  service: LessonDiscussionCountsService;
}): LessonDiscussionCountsController {
  return {
    async getLessonInteractionCounts(request, reply) {
      const user = request.user!;
      const result = await service.getCounts(database, {
        courseId: request.params.courseId,
        lessonId: request.params.lessonId,
        actor: { userId: user.id, roles: user.roles },
      });
      return reply.status(200).send(result);
    },
  };
}
