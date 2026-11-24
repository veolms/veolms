import {
  latestQuestionGenerationResponseSchema,
  questionGenerationJobSchema,
  quizAiStreamEventSchema,
  type GenerateQuizAiRequest,
  type QuizAiStreamEvent,
  type ReviseQuizQuestionAiRequest,
  type StartQuestionGenerationRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";
import { streamNdjson } from "../../lib/ndjson-stream";

const id = encodeURIComponent;

export const questionAiService = {
  /** AI writes quiz questions for a lecture; nothing is saved. */
  writeQuiz: (
    courseId: string,
    lessonId: string,
    payload: GenerateQuizAiRequest,
    onEvent: (event: QuizAiStreamEvent) => void,
    signal: AbortSignal,
  ) =>
    streamNdjson(
      `/courses/${id(courseId)}/lessons/${id(lessonId)}/quiz-ai`,
      payload,
      quizAiStreamEventSchema,
      onEvent,
      signal,
    ),
  /** AI changes one question as asked; nothing is saved. */
  reviseQuestion: (
    courseId: string,
    lessonId: string,
    payload: ReviseQuizQuestionAiRequest,
    onEvent: (event: QuizAiStreamEvent) => void,
    signal: AbortSignal,
  ) =>
    streamNdjson(
      `/courses/${id(courseId)}/lessons/${id(lessonId)}/quiz-ai/revise`,
      payload,
      quizAiStreamEventSchema,
      onEvent,
      signal,
    ),

  startJob: async (courseId: string, payload: StartQuestionGenerationRequest) =>
    questionGenerationJobSchema.parse(
      await api.post<unknown>(
        `/courses/${id(courseId)}/question-jobs`,
        payload,
      ),
    ),
  latestJob: async (courseId: string) =>
    latestQuestionGenerationResponseSchema.parse(
      await api.get<unknown>(`/courses/${id(courseId)}/question-jobs/latest`),
    ).job,
  cancelJob: async (jobId: string) =>
    questionGenerationJobSchema.parse(
      await api.post<unknown>(`/question-jobs/${id(jobId)}/cancel`),
    ),
  publishQuizzes: async (jobId: string, quizIds?: string[]) =>
    questionGenerationJobSchema.parse(
      await api.post<unknown>(
        `/question-jobs/${id(jobId)}/publish-quizzes`,
        quizIds ? { quizIds } : {},
      ),
    ),
};
