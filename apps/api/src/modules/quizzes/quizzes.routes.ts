import { z } from "zod";
import {
  assignQuizRequestSchema,
  bulkQuizAnswersRequestSchema,
  courseQuizAnalyticsSchema,
  courseQuizAssignmentsResponseSchema,
  createQuizQuestionRequestSchema,
  createQuizRequestSchema,
  createQuizWithQuestionsRequestSchema,
  learnerQuizAttemptSchema,
  myQuizAssignmentsResponseSchema,
  quizAnalyticsSchema,
  quizAnswerSyncResponseSchema,
  quizCoursePricingSchema,
  quizDeleteResponseSchema,
  quizHistoryResponseSchema,
  quizPricingPreviewResponseSchema,
  quizResultSchema,
  quizAssignmentSchema,
  quizSchema,
  setQuizCoursePricingRequestSchema,
  studentQuizReportSchema,
  updateQuizAssignmentRequestSchema,
  updateQuizQuestionRequestSchema,
  updateQuizRequestSchema,
} from "@veolms/contracts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import { ADMIN_ROLE, INSTRUCTOR_ROLE } from "../auth/index.ts";
import { createCourseService } from "../courses/course/course.service.ts";
import { createAccessService } from "../access/access.service.ts";
import { createPricingService } from "../commerce/pricing/pricing.service.ts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthoringService } from "./authoring/authoring.service.ts";
import { createAssignmentService } from "./assignments/assignment.service.ts";
import { createAttemptService } from "./attempts/attempt.service.ts";
import { createAnalyticsService } from "./analytics/analytics.service.ts";
import { createQuizController } from "./quizzes.controller.ts";

const idParam = (name: string) => z.object({ [name]: z.uuid() });

const quizRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const courseService = createCourseService({
    database: options.database,
    services: options.services,
  });
  const pricingService = createPricingService({ database: options.database });
  const shared = {
    database: options.database,
    getAcademyId: async () =>
      (await auth.setupService.getAcademy())?.id ?? null,
    authService: auth.authService,
    courseService,
    accessService: createAccessService(),
  };
  const controller = createQuizController({
    authoring: createAuthoringService(shared),
    assignments: createAssignmentService(shared),
    attempts: createAttemptService(shared),
    analytics: createAnalyticsService(shared),
    pricingService,
  });
  const author = [
    ...auth.mfaVerified,
    auth.middleware.requireRoles([ADMIN_ROLE, INSTRUCTOR_ROLE]),
  ];
  const learner = auth.mfaVerified;
  const errors = {
    400: errorResponse("Invalid request"),
    401: errorResponse("Authentication required"),
    403: errorResponse("Forbidden"),
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
  };

  app.post(
    "/quizzes",
    {
      schema: {
        operationId: "createQuiz",
        tags: ["Quizzes"],
        body: createQuizRequestSchema,
        response: { 201: jsonResponse("Quiz created", quizSchema), ...errors },
      },
      preHandler: author,
    },
    controller.create,
  );
  app.post(
    "/quizzes/complete",
    {
      schema: {
        operationId: "createQuizWithQuestions",
        tags: ["Quizzes"],
        body: createQuizWithQuestionsRequestSchema,
        response: {
          201: jsonResponse("Quiz created", quizSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.createWithQuestions,
  );
  app.get(
    "/quizzes/mine",
    {
      schema: {
        operationId: "listMyQuizzes",
        tags: ["Quizzes"],
        response: {
          200: jsonResponse("Quizzes", z.array(quizSchema)),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.listMine,
  );
  app.get(
    "/quizzes/:id",
    {
      schema: {
        operationId: "getQuiz",
        tags: ["Quizzes"],
        params: idParam("id"),
        response: { 200: jsonResponse("Quiz", quizSchema), ...errors },
      },
      preHandler: author,
    },
    controller.get,
  );
  app.patch(
    "/quizzes/:id",
    {
      schema: {
        operationId: "updateQuiz",
        tags: ["Quizzes"],
        params: idParam("id"),
        body: updateQuizRequestSchema,
        response: { 200: jsonResponse("Quiz updated", quizSchema), ...errors },
      },
      preHandler: author,
    },
    controller.update,
  );
  app.delete(
    "/quizzes/:id",
    {
      schema: {
        operationId: "deleteQuiz",
        tags: ["Quizzes"],
        params: idParam("id"),
        response: {
          200: jsonResponse("Quiz deleted", quizDeleteResponseSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.deleteQuiz,
  );
  app.post(
    "/quizzes/:id/questions",
    {
      schema: {
        operationId: "addQuizQuestion",
        tags: ["Quizzes"],
        params: idParam("id"),
        body: createQuizQuestionRequestSchema,
        response: {
          200: jsonResponse("Question added", quizSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.addQuestion,
  );
  app.patch(
    "/quizzes/:id/questions/:questionId",
    {
      schema: {
        operationId: "updateQuizQuestion",
        tags: ["Quizzes"],
        params: z.object({ id: z.uuid(), questionId: z.uuid() }),
        body: updateQuizQuestionRequestSchema,
        response: {
          200: jsonResponse("Question updated", quizSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.updateQuestion,
  );
  app.delete(
    "/quizzes/:id/questions/:questionId",
    {
      schema: {
        operationId: "deleteQuizQuestion",
        tags: ["Quizzes"],
        params: z.object({ id: z.uuid(), questionId: z.uuid() }),
        response: {
          200: jsonResponse("Question deleted", quizDeleteResponseSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.deleteQuestion,
  );
  app.post(
    "/quizzes/:id/publish",
    {
      schema: {
        operationId: "publishQuiz",
        tags: ["Quizzes"],
        params: idParam("id"),
        response: {
          200: jsonResponse("Quiz published", quizSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.publish,
  );
  app.post(
    "/courses/:courseId/lessons/:lessonId/quiz-assignment",
    {
      schema: {
        operationId: "assignQuiz",
        tags: ["Quizzes"],
        params: z.object({ courseId: z.uuid(), lessonId: z.uuid() }),
        body: assignQuizRequestSchema,
        response: {
          201: jsonResponse("Quiz assigned", quizAssignmentSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.assign,
  );
  app.get(
    "/courses/:courseId/quiz-assignments",
    {
      schema: {
        operationId: "listCourseQuizAssignments",
        tags: ["Quizzes"],
        params: idParam("courseId"),
        response: {
          200: jsonResponse(
            "Quiz assignments",
            courseQuizAssignmentsResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.listCourseAssignments,
  );
  app.get(
    "/courses/:courseId/quiz-assignments/:assignmentId/pricing-preview",
    {
      schema: {
        operationId: "getQuizPricingPreview",
        tags: ["Quizzes"],
        params: z.object({ courseId: z.uuid(), assignmentId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Quiz pricing preview",
            quizPricingPreviewResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: auth.middleware.requireMfaVerifiedIfAuthenticated,
    },
    controller.getPricingPreview,
  );
  app.get(
    "/courses/:courseId/quiz-pricing",
    {
      schema: {
        operationId: "getQuizCoursePricing",
        tags: ["Quizzes"],
        params: z.object({ courseId: z.uuid() }),
        response: {
          200: jsonResponse("Quiz course pricing", quizCoursePricingSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.getCoursePricing,
  );
  app.put(
    "/courses/:courseId/quiz-pricing",
    {
      schema: {
        operationId: "setQuizCoursePricing",
        tags: ["Quizzes"],
        params: z.object({ courseId: z.uuid() }),
        body: setQuizCoursePricingRequestSchema,
        response: {
          200: jsonResponse("Quiz course pricing", quizCoursePricingSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.setPricing,
  );
  app.patch(
    "/quiz-assignments/:assignmentId",
    {
      schema: {
        operationId: "updateQuizAssignment",
        tags: ["Quizzes"],
        params: idParam("assignmentId"),
        body: updateQuizAssignmentRequestSchema,
        response: {
          200: jsonResponse("Quiz assignment updated", quizAssignmentSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.updateAssignment,
  );
  app.delete(
    "/quiz-assignments/:assignmentId",
    {
      schema: {
        operationId: "deleteQuizAssignment",
        tags: ["Quizzes"],
        params: idParam("assignmentId"),
        response: {
          200: jsonResponse(
            "Quiz assignment deleted",
            quizDeleteResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.deleteAssignment,
  );
  app.get(
    "/me/quizzes",
    {
      schema: {
        operationId: "listMyQuizAssignments",
        tags: ["Quizzes"],
        response: {
          200: jsonResponse(
            "Assigned Quizzes",
            myQuizAssignmentsResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.listMineAssignments,
  );
  app.get(
    "/me/quizzes/history",
    {
      schema: {
        operationId: "listMyQuizHistory",
        tags: ["Quizzes"],
        response: {
          200: jsonResponse("Quiz history", quizHistoryResponseSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.history,
  );
  app.post(
    "/quiz-assignments/:assignmentId/attempts",
    {
      schema: {
        operationId: "startQuizAttempt",
        tags: ["Quizzes"],
        params: idParam("assignmentId"),
        response: {
          201: jsonResponse("Quiz attempt started", learnerQuizAttemptSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.start,
  );
  app.get(
    "/quiz-attempts/:attemptId",
    {
      schema: {
        operationId: "getQuizAttempt",
        tags: ["Quizzes"],
        params: idParam("attemptId"),
        response: {
          200: jsonResponse("Quiz attempt", learnerQuizAttemptSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.getAttempt,
  );
  app.put(
    "/quiz-attempts/:attemptId/answers",
    {
      schema: {
        operationId: "saveQuizAnswers",
        tags: ["Quizzes"],
        params: idParam("attemptId"),
        body: bulkQuizAnswersRequestSchema,
        response: {
          200: jsonResponse("Answers saved", quizAnswerSyncResponseSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.saveAnswers,
  );
  app.post(
    "/quiz-attempts/:attemptId/submit",
    {
      schema: {
        operationId: "submitQuizAttempt",
        tags: ["Quizzes"],
        params: idParam("attemptId"),
        response: {
          200: jsonResponse("Quiz submitted", quizResultSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.submit,
  );
  app.get(
    "/quiz-attempts/:attemptId/result",
    {
      schema: {
        operationId: "getQuizResult",
        tags: ["Quizzes"],
        params: idParam("attemptId"),
        response: {
          200: jsonResponse("Quiz result", quizResultSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.result,
  );
  app.get(
    "/quiz-assignments/:assignmentId/analytics",
    {
      schema: {
        operationId: "getQuizAnalytics",
        tags: ["Quizzes"],
        params: idParam("assignmentId"),
        response: {
          200: jsonResponse("Quiz analytics", quizAnalyticsSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.assignmentAnalytics,
  );
  app.get(
    "/courses/:courseId/quiz-analytics",
    {
      schema: {
        operationId: "getCourseQuizAnalytics",
        tags: ["Quizzes"],
        params: idParam("courseId"),
        response: {
          200: jsonResponse("Course Quiz analytics", courseQuizAnalyticsSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.courseAnalytics,
  );
  app.get(
    "/students/:studentId/quiz-report",
    {
      schema: {
        operationId: "getStudentQuizReport",
        tags: ["Quizzes"],
        params: idParam("studentId"),
        response: {
          200: jsonResponse("Student Quiz report", studentQuizReportSchema),
          ...errors,
        },
      },
      preHandler: author,
    },
    controller.studentReport,
  );
};
export default quizRoutes;
