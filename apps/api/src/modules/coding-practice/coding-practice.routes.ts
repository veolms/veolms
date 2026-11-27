import { normalizeIP } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CODING_LIMITS,
  codingAssignmentAnalyticsSchema,
  codingExerciseSchema,
  codingLessonSchema,
  codingPracticeStatsSchema,
  practiceCoursesResponseSchema,
  codingSolutionResponseSchema,
  codingSubmissionsResponseSchema,
  courseCodingExercisesResponseSchema,
  createCodingExerciseRequestSchema,
  lecturePracticeResponseSchema,
  publishCodingExerciseRequestSchema,
  saveCodingDraftRequestSchema,
  saveCodingDraftResponseSchema,
  submitCodingRequestSchema,
  submitCodingResponseSchema,
  updateCodingExerciseRequestSchema,
  type Permission,
} from "@veolms/contracts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createAccessService } from "../access/access.service.ts";
import { createCourseService } from "../courses/course/course.service.ts";
import { createLearningActivityCredit } from "../learning-progress/index.ts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAnalyticsService } from "./analytics/analytics.service.ts";
import { createAuthoringService } from "./authoring/authoring.service.ts";
import { createCodingPracticeController } from "./coding-practice.controller.ts";
import { createLearnerService } from "./learner/learner.service.ts";

/** Per-user rate limit (per process), as on the support and chat routes. */
function perUser(max: number, timeWindow: string) {
  return {
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      request.user?.id ?? normalizeIP(request.ip),
  } as const;
}

const tags = ["Coding practice"];
const success = z.strictObject({ success: z.literal(true) });
const exerciseParams = z.object({ id: z.uuid() });
const courseParams = z.object({ courseId: z.uuid() });
const lessonParams = z.object({ courseId: z.uuid(), lessonId: z.uuid() });
const assignmentParams = z.object({ assignmentId: z.uuid() });

const codingPracticeRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const shared = {
    database: options.database,
    getAcademyId: async () =>
      (await auth.setupService.getAcademy())?.id ?? null,
    authService: auth.authService,
    courseService: createCourseService({
      database: options.database,
      services: options.services,
    }),
    accessService: createAccessService(),
    activityCredit: createLearningActivityCredit(),
  };
  const controller = createCodingPracticeController({
    authoring: createAuthoringService(shared),
    learner: createLearnerService(shared),
    analytics: createAnalyticsService(shared),
  });
  // Exercise ids are not course ids, so the permission is checked here
  // platform-wide; the services then require that the actor manages the
  // exercise's course (an instructor only their own courses).
  const { requires } = createPermissionPreHandlers(options.database);
  const can = (permission: Permission) => requires(permission, "platform");
  const learner = auth.mfaVerified;
  const errors = {
    400: errorResponse("Invalid request"),
    401: errorResponse("Authentication required"),
    403: errorResponse("Forbidden"),
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
  };

  app.get(
    "/courses/:courseId/coding-exercises",
    {
      schema: {
        operationId: "listCourseCodingExercises",
        tags,
        params: courseParams,
        response: {
          200: jsonResponse(
            "The course's practice exercises",
            courseCodingExercisesResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: can("coding.read"),
    },
    controller.listCourse,
  );
  app.post(
    "/courses/:courseId/coding-exercises",
    {
      schema: {
        operationId: "createCodingExercise",
        tags,
        params: courseParams,
        body: createCodingExerciseRequestSchema,
        response: {
          201: jsonResponse("Exercise created", codingExerciseSchema),
          ...errors,
        },
      },
      preHandler: can("coding.manage"),
    },
    controller.create,
  );
  app.get(
    "/coding-exercises/:id",
    {
      schema: {
        operationId: "getCodingExercise",
        tags,
        params: exerciseParams,
        response: {
          200: jsonResponse("Exercise", codingExerciseSchema),
          ...errors,
        },
      },
      preHandler: can("coding.read"),
    },
    controller.get,
  );
  app.patch(
    "/coding-exercises/:id",
    {
      schema: {
        operationId: "updateCodingExercise",
        tags,
        params: exerciseParams,
        body: updateCodingExerciseRequestSchema,
        response: {
          200: jsonResponse("Exercise saved", codingExerciseSchema),
          ...errors,
        },
      },
      preHandler: can("coding.manage"),
    },
    controller.update,
  );
  app.post(
    "/coding-exercises/:id/publish",
    {
      schema: {
        operationId: "publishCodingExercise",
        tags,
        params: exerciseParams,
        body: publishCodingExerciseRequestSchema,
        response: {
          200: jsonResponse("Exercise published", codingExerciseSchema),
          ...errors,
        },
      },
      preHandler: can("coding.manage"),
    },
    controller.publish,
  );
  app.delete(
    "/coding-exercises/:id",
    {
      schema: {
        operationId: "deleteCodingExercise",
        tags,
        params: exerciseParams,
        response: { 200: jsonResponse("Exercise deleted", success), ...errors },
      },
      preHandler: can("coding.manage"),
    },
    controller.remove,
  );

  app.get(
    "/practice/me",
    {
      schema: {
        operationId: "getMyPracticeStats",
        tags,
        summary: "My practice: solved, streak, calendar (one course or all)",
        querystring: z.object({ courseId: z.uuid().optional() }),
        response: {
          200: jsonResponse("My practice stats", codingPracticeStatsSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.stats,
  );
  app.get(
    "/practice/courses",
    {
      schema: {
        operationId: "listMyPracticeCourses",
        tags,
        summary: "My courses that have practice, with progress",
        response: {
          200: jsonResponse(
            "My practice courses",
            practiceCoursesResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.practiceCourses,
  );
  app.get(
    "/courses/:courseId/practice",
    {
      schema: {
        operationId: "listCoursePractice",
        tags,
        params: courseParams,
        response: {
          200: jsonResponse(
            "The course's practice exercises",
            lecturePracticeResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.coursePractice,
  );
  app.get(
    "/courses/:courseId/lessons/:lessonId/practice",
    {
      schema: {
        operationId: "listLecturePractice",
        tags,
        params: lessonParams,
        response: {
          200: jsonResponse(
            "The lecture's practice exercises",
            lecturePracticeResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.lecturePractice,
  );
  app.get(
    "/coding-assignments/:assignmentId",
    {
      schema: {
        operationId: "getCodingPractice",
        tags,
        params: assignmentParams,
        // Staff: the newest version, published or not, as a preview.
        querystring: z.object({ preview: z.enum(["1"]).optional() }),
        response: {
          200: jsonResponse("One practice exercise", codingLessonSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.getPractice,
  );
  app.put(
    "/coding-assignments/:assignmentId/draft",
    {
      // The page keeps the draft on the device and sends it again.
      config: {
        shedUnderLoad: true,
        rateLimit: perUser(CODING_LIMITS.draftSavesPerMinute, "1 minute"),
      },
      schema: {
        operationId: "saveCodingDraft",
        tags,
        params: assignmentParams,
        body: saveCodingDraftRequestSchema,
        response: {
          200: jsonResponse("Draft saved", saveCodingDraftResponseSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.saveDraft,
  );
  app.post(
    "/coding-assignments/:assignmentId/submissions",
    {
      config: { rateLimit: perUser(CODING_LIMITS.submitsPerHour, "1 hour") },
      schema: {
        operationId: "submitCodingExercise",
        tags,
        params: assignmentParams,
        body: submitCodingRequestSchema,
        response: {
          200: jsonResponse("Submission recorded", submitCodingResponseSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.submit,
  );
  app.get(
    "/coding-assignments/:assignmentId/submissions",
    {
      schema: {
        operationId: "listMyCodingSubmissions",
        tags,
        params: assignmentParams,
        response: {
          200: jsonResponse("My submissions", codingSubmissionsResponseSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.listSubmissions,
  );
  app.post(
    "/coding-assignments/:assignmentId/solution",
    {
      config: { rateLimit: perUser(10, "1 minute") },
      schema: {
        operationId: "getCodingSolution",
        tags,
        params: assignmentParams,
        querystring: z.object({ preview: z.enum(["1"]).optional() }),
        response: {
          200: jsonResponse("Solution", codingSolutionResponseSchema),
          ...errors,
        },
      },
      preHandler: learner,
    },
    controller.solution,
  );

  app.get(
    "/coding-assignments/:assignmentId/analytics",
    {
      schema: {
        operationId: "getCodingAssignmentAnalytics",
        tags,
        params: assignmentParams,
        response: {
          200: jsonResponse("Results", codingAssignmentAnalyticsSchema),
          ...errors,
        },
      },
      preHandler: can("submission.read"),
    },
    controller.analytics,
  );
  app.get(
    "/coding-assignments/:assignmentId/students/:studentId/submissions",
    {
      schema: {
        operationId: "getLearnerCodingSubmissions",
        tags,
        params: z.object({ assignmentId: z.uuid(), studentId: z.uuid() }),
        response: {
          200: jsonResponse(
            "A learner's submissions",
            codingSubmissionsResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: can("submission.read"),
    },
    controller.learnerSubmissions,
  );
};

export default codingPracticeRoutes;
