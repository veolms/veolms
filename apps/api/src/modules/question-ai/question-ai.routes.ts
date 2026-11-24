import type { FastifyReply, FastifyRequest } from "fastify";
import { normalizeIP } from "@fastify/rate-limit";
import { z } from "zod";
import {
  generateQuizAiRequestSchema,
  latestQuestionGenerationResponseSchema,
  questionGenerationJobSchema,
  reviseQuizQuestionAiRequestSchema,
  startQuestionGenerationRequestSchema,
  type GenerateQuizAiRequest,
  type QuizAiStreamEvent,
  type ReviseQuizQuestionAiRequest,
  type StartQuestionGenerationRequest,
} from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { streamEvents } from "../coding-practice/ai/coding-ai.controller.ts";
import { createQuestionAiServices } from "./question-ai.factory.ts";

const tags = ["AI questions"];
const errors = {
  400: errorResponse("Invalid request"),
  401: errorResponse("Authentication required"),
  403: errorResponse("Forbidden"),
  404: errorResponse("Not found"),
  409: errorResponse("Conflict"),
};

const perUser = (max: number, timeWindow: string) =>
  ({
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      request.user?.id ?? normalizeIP(request.ip),
  }) as const;

type Signed = FastifyRequest & { user: NonNullable<FastifyRequest["user"]> };
const actor = (request: FastifyRequest) => {
  const { user } = request as Signed;
  return { id: user.id, roles: user.roles };
};
const lessonParams = z.object({ courseId: z.uuid(), lessonId: z.uuid() });

/**
 * AI for quizzes (one lecture: questions shown unsaved in the quiz editor)
 * and questions for a whole course (a background run that saves drafts).
 */
const questionAiRoutes: RoutePlugin = async (app, options) => {
  const { quizAi, jobs } = createQuestionAiServices(options);
  const { requires } = createPermissionPreHandlers(options.database);

  app.post(
    "/courses/:courseId/lessons/:lessonId/quiz-ai",
    {
      config: { rateLimit: perUser(15, "10 minutes") },
      schema: {
        operationId: "generateQuizWithAi",
        tags,
        summary: "Let AI write quiz questions for a lecture (not saved)",
        description:
          "Answers with NDJSON: progress lines, then one `done` line with the questions, or `error` (quizAiStreamEventSchema).",
        params: lessonParams,
        body: generateQuizAiRequestSchema,
        response: errors,
      },
      preHandler: requires("quiz.create", "platform"),
    },
    (request: FastifyRequest, reply: FastifyReply) => {
      const { courseId, lessonId } = request.params as z.infer<
        typeof lessonParams
      >;
      return streamEvents<QuizAiStreamEvent>(
        request,
        reply,
        (emit, signal) =>
          quizAi.draftForLecture(
            actor(request),
            courseId,
            lessonId,
            request.body as GenerateQuizAiRequest,
            emit,
            signal,
          ),
        "Something went wrong while the AI wrote the quiz. Try again.",
      );
    },
  );

  app.post(
    "/courses/:courseId/lessons/:lessonId/quiz-ai/revise",
    {
      config: { rateLimit: perUser(30, "10 minutes") },
      schema: {
        operationId: "reviseQuizQuestionWithAi",
        tags,
        summary: "Let AI change one quiz question (not saved)",
        params: lessonParams,
        body: reviseQuizQuestionAiRequestSchema,
        response: errors,
      },
      preHandler: requires("quiz.create", "platform"),
    },
    (request: FastifyRequest, reply: FastifyReply) => {
      const { courseId, lessonId } = request.params as z.infer<
        typeof lessonParams
      >;
      return streamEvents<QuizAiStreamEvent>(
        request,
        reply,
        (emit, signal) =>
          quizAi.reviseQuestion(
            actor(request),
            courseId,
            lessonId,
            request.body as ReviseQuizQuestionAiRequest,
            emit,
            signal,
          ),
        "Something went wrong while the AI rewrote the question. Try again.",
      );
    },
  );

  app.post(
    "/courses/:courseId/question-jobs",
    {
      config: { rateLimit: perUser(6, "1 hour") },
      schema: {
        operationId: "startQuestionGeneration",
        tags,
        summary:
          "Let AI write draft quizzes and coding questions for the whole course",
        params: z.object({ courseId: z.uuid() }),
        body: startQuestionGenerationRequestSchema,
        response: {
          201: jsonResponse("The run, queued", questionGenerationJobSchema),
          ...errors,
        },
      },
      preHandler: requires("quiz.create", "platform"),
    },
    async (request, reply) => {
      const job = await jobs.start(
        actor(request),
        request.params.courseId,
        request.body as StartQuestionGenerationRequest,
      );
      return reply.code(201).send(job);
    },
  );

  app.get(
    "/courses/:courseId/question-jobs/latest",
    {
      schema: {
        operationId: "getLatestQuestionGeneration",
        tags,
        params: z.object({ courseId: z.uuid() }),
        response: {
          200: jsonResponse(
            "The course's latest run",
            latestQuestionGenerationResponseSchema,
          ),
          ...errors,
        },
      },
      preHandler: requires("quiz.create", "platform"),
    },
    async (request) =>
      await jobs.latest(actor(request), request.params.courseId),
  );

  app.post(
    "/question-jobs/:jobId/cancel",
    {
      schema: {
        operationId: "cancelQuestionGeneration",
        tags,
        params: z.object({ jobId: z.uuid() }),
        response: {
          200: jsonResponse("The run", questionGenerationJobSchema),
          ...errors,
        },
      },
      preHandler: requires("quiz.create", "platform"),
    },
    async (request) => await jobs.cancel(actor(request), request.params.jobId),
  );

  app.post(
    "/question-jobs/:jobId/publish-quizzes",
    {
      schema: {
        operationId: "publishGeneratedQuizzes",
        tags,
        summary:
          "Show the run's draft quizzes to students (all, or the ones listed)",
        params: z.object({ jobId: z.uuid() }),
        body: z
          .strictObject({ quizIds: z.array(z.uuid()).max(500).optional() })
          .optional(),
        response: {
          200: jsonResponse("The run", questionGenerationJobSchema),
          ...errors,
        },
      },
      preHandler: requires("quiz.publish", "platform"),
    },
    async (request) =>
      await jobs.publishQuizzes(
        actor(request),
        request.params.jobId,
        (request.body as { quizIds?: string[] } | undefined)?.quizIds,
      ),
  );
};

export default questionAiRoutes;
