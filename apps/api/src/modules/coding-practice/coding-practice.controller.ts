import type { FastifyReply, FastifyRequest } from "fastify";
import type { CodingAnalyticsService } from "./analytics/analytics.service.ts";
import type { CodingAuthoringService } from "./authoring/authoring.service.ts";
import type { CodingLearnerService } from "./learner/learner.service.ts";

type Signed = FastifyRequest & {
  user: NonNullable<FastifyRequest["user"]>;
};
const actor = (request: FastifyRequest) => {
  const { user } = request as Signed;
  return { id: user.id, roles: user.roles };
};
const params = <T>(request: FastifyRequest) => request.params as T;

export function createCodingPracticeController({
  authoring,
  learner,
  analytics,
}: {
  authoring: CodingAuthoringService;
  learner: CodingLearnerService;
  analytics: CodingAnalyticsService;
}) {
  return {
    listCourse: async (request: FastifyRequest) => ({
      exercises: await authoring.listCourse(
        actor(request),
        params<{ courseId: string }>(request).courseId,
      ),
    }),
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await authoring.create(
        actor(request),
        params<{ courseId: string }>(request).courseId,
        request.body as never,
      );
      reply.code(201);
      return result;
    },
    get: async (request: FastifyRequest) =>
      authoring.get(actor(request), params<{ id: string }>(request).id),
    update: async (request: FastifyRequest) =>
      authoring.update(
        actor(request),
        params<{ id: string }>(request).id,
        request.body as never,
      ),
    publish: async (request: FastifyRequest) =>
      authoring.publish(
        actor(request),
        params<{ id: string }>(request).id,
        request.body as never,
      ),
    remove: async (request: FastifyRequest) =>
      authoring.remove(actor(request), params<{ id: string }>(request).id),
    stats: async (request: FastifyRequest) =>
      learner.stats(
        actor(request),
        (request.query as { courseId?: string }).courseId ?? null,
      ),
    practiceCourses: async (request: FastifyRequest) =>
      learner.practiceCourses(actor(request)),
    coursePractice: async (request: FastifyRequest) =>
      learner.listCoursePractice(
        actor(request),
        params<{ courseId: string }>(request).courseId,
      ),
    lecturePractice: async (request: FastifyRequest) => {
      const { courseId, lessonId } = params<{
        courseId: string;
        lessonId: string;
      }>(request);
      return learner.listLecturePractice(actor(request), courseId, lessonId);
    },
    getPractice: async (request: FastifyRequest) =>
      learner.getPractice(
        actor(request),
        params<{ assignmentId: string }>(request).assignmentId,
        { preview: (request.query as { preview?: string }).preview === "1" },
      ),
    saveDraft: async (request: FastifyRequest) =>
      learner.saveDraft(
        actor(request),
        params<{ assignmentId: string }>(request).assignmentId,
        request.body as never,
      ),
    submit: async (request: FastifyRequest) =>
      learner.submit(
        actor(request),
        params<{ assignmentId: string }>(request).assignmentId,
        request.body as never,
      ),
    listSubmissions: async (request: FastifyRequest) =>
      learner.listSubmissions(
        actor(request),
        params<{ assignmentId: string }>(request).assignmentId,
      ),
    solution: async (request: FastifyRequest) =>
      learner.solution(
        actor(request),
        params<{ assignmentId: string }>(request).assignmentId,
        { preview: (request.query as { preview?: string }).preview === "1" },
      ),
    analytics: async (request: FastifyRequest) =>
      analytics.assignment(
        actor(request),
        params<{ assignmentId: string }>(request).assignmentId,
      ),
    learnerSubmissions: async (request: FastifyRequest) => {
      const { assignmentId, studentId } = params<{
        assignmentId: string;
        studentId: string;
      }>(request);
      return analytics.learnerSubmissions(
        actor(request),
        assignmentId,
        studentId,
      );
    },
  };
}
