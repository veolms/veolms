import type { FastifyReply, FastifyRequest } from "fastify";
import type { SetQuizCoursePricingRequest } from "@veolms/contracts";
import type { AuthoringService } from "./authoring/authoring.service.ts";
import type { AssignmentService } from "./assignments/assignment.service.ts";
import type { AttemptService } from "./attempts/attempt.service.ts";
import type { AnalyticsService } from "./analytics/analytics.service.ts";
import type { PricingService } from "../commerce/pricing/pricing.service.ts";
import { isAdmin } from "./shared/quiz.types.ts";

type RequestContext = FastifyRequest & {
  user: NonNullable<FastifyRequest["user"]>;
};
const context = (request: FastifyRequest) => request as RequestContext;
const actor = (request: FastifyRequest) => ({
  id: context(request).user.id,
  roles: context(request).user.roles,
});

export function createQuizController({
  authoring,
  assignments,
  attempts,
  analytics,
  pricingService,
}: {
  authoring: AuthoringService;
  assignments: AssignmentService;
  attempts: AttemptService;
  analytics: AnalyticsService;
  pricingService: PricingService;
}) {
  return {
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await authoring.createQuiz(
        actor(request),
        request.body as never,
      );
      reply.code(201);
      return result;
    },
    createWithQuestions: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const result = await authoring.createQuizWithQuestions(
        actor(request),
        request.body as never,
      );
      reply.code(201);
      return result;
    },
    listMine: async (request: FastifyRequest) =>
      authoring.listMine(actor(request)),
    get: async (request: FastifyRequest) =>
      authoring.getQuiz(actor(request), (request.params as { id: string }).id),
    update: async (request: FastifyRequest) =>
      authoring.updateQuiz(
        actor(request),
        (request.params as { id: string }).id,
        request.body as never,
      ),
    deleteQuiz: async (request: FastifyRequest) =>
      authoring.deleteQuiz(
        actor(request),
        (request.params as { id: string }).id,
      ),
    addQuestion: async (request: FastifyRequest) =>
      authoring.addQuestion(
        actor(request),
        (request.params as { id: string }).id,
        request.body as never,
      ),
    updateQuestion: async (request: FastifyRequest) => {
      const params = request.params as { id: string; questionId: string };
      return authoring.updateQuestion(
        actor(request),
        params.id,
        params.questionId,
        request.body as never,
      );
    },
    deleteQuestion: async (request: FastifyRequest) => {
      const params = request.params as { id: string; questionId: string };
      return authoring.deleteQuestion(
        actor(request),
        params.id,
        params.questionId,
      );
    },
    publish: async (request: FastifyRequest) =>
      authoring.publish(actor(request), (request.params as { id: string }).id),
    assign: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { courseId: string; lessonId: string };
      const result = await assignments.assign(
        actor(request),
        params.courseId,
        params.lessonId,
        request.body as never,
      );
      reply.code(201);
      return result;
    },
    updateAssignment: async (request: FastifyRequest) =>
      assignments.update(
        actor(request),
        (request.params as { assignmentId: string }).assignmentId,
        request.body as never,
      ),
    deleteAssignment: async (request: FastifyRequest) =>
      assignments.deleteAssignment(
        actor(request),
        (request.params as { assignmentId: string }).assignmentId,
      ),
    listCourseAssignments: async (request: FastifyRequest) =>
      assignments.listForCourse(
        actor(request),
        (request.params as { courseId: string }).courseId,
      ),
    listMineAssignments: async (request: FastifyRequest) =>
      attempts.listAssignments(context(request).user.id),
    start: async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await attempts.start(
        context(request).user.id,
        (request.params as { assignmentId: string }).assignmentId,
        context(request).user.roles,
      );
      reply.code(201);
      return result;
    },
    getAttempt: async (request: FastifyRequest) =>
      attempts.getAttempt(
        context(request).user.id,
        (request.params as { attemptId: string }).attemptId,
        context(request).user.roles,
      ),
    saveAnswers: async (request: FastifyRequest) =>
      attempts.bulkSaveAnswers(
        context(request).user.id,
        (request.params as { attemptId: string }).attemptId,
        request.body as never,
        context(request).user.roles,
      ),
    submit: async (request: FastifyRequest) =>
      attempts.submit(
        context(request).user.id,
        (request.params as { attemptId: string }).attemptId,
        context(request).user.roles,
      ),
    result: async (request: FastifyRequest) =>
      attempts.result(
        context(request).user.id,
        (request.params as { attemptId: string }).attemptId,
      ),
    history: async (request: FastifyRequest) =>
      attempts.listMine(context(request).user.id),
    assignmentAnalytics: async (request: FastifyRequest) =>
      analytics.assignment(
        actor(request),
        (request.params as { assignmentId: string }).assignmentId,
      ),
    courseAnalytics: async (request: FastifyRequest) =>
      analytics.course(
        actor(request),
        (request.params as { courseId: string }).courseId,
      ),
    studentReport: async (request: FastifyRequest) =>
      analytics.student(
        actor(request),
        (request.params as { studentId: string }).studentId,
      ),
    getCoursePricing: async (request: FastifyRequest) =>
      assignments.getPricing(
        actor(request),
        (request.params as { courseId: string }).courseId,
      ),
    setPricing: async (request: FastifyRequest) => {
      const params = request.params as { courseId: string };
      return assignments.setPricing(
        actor(request),
        params.courseId,
        request.body as SetQuizCoursePricingRequest,
      );
    },
    getPricingPreview: async (request: FastifyRequest) => {
      const params = request.params as {
        courseId: string;
        assignmentId: string;
      };
      return pricingService.calculateQuizPricing({
        userId: request.user?.id ?? null,
        quizAssignmentId: params.assignmentId,
        courseId: params.courseId,
        isAdmin: request.user
          ? isAdmin({ id: request.user.id, roles: request.user.roles })
          : false,
      });
    },
  };
}
export type QuizController = ReturnType<typeof createQuizController>;
