import { api } from "../../lib/api-client";
import {
  bulkQuizAnswersRequestSchema,
  courseQuizAnalyticsSchema,
  courseQuizAssignmentsResponseSchema,
  learnerQuizAttemptSchema,
  myQuizAssignmentsResponseSchema,
  quizAnswerSyncResponseSchema,
  quizAssignmentSchema,
  quizAnalyticsSchema,
  quizDeleteResponseSchema,
  quizHistoryResponseSchema,
  quizResultSchema,
  quizSchema,
  studentQuizReportSchema,
  type AssignQuizRequest,
  type BulkQuizAnswersRequest,
  type CreateQuizQuestionRequest,
  type CreateQuizRequest,
  type CreateQuizWithQuestionsRequest,
  type UpdateQuizAssignmentRequest,
  type UpdateQuizQuestionRequest,
  type UpdateQuizRequest,
} from "@veolms/contracts";

export const quizzesService = {
  listMine: async () =>
    quizSchema.array().parse(await api.get<unknown>("/quizzes/mine")),
  get: async (id: string) =>
    quizSchema.parse(
      await api.get<unknown>(`/quizzes/${encodeURIComponent(id)}`),
    ),
  create: async (payload: CreateQuizRequest) =>
    quizSchema.parse(await api.post<unknown>("/quizzes", payload)),
  createWithQuestions: async (payload: CreateQuizWithQuestionsRequest) =>
    quizSchema.parse(
      await api.post<unknown>("/quizzes/complete", payload),
    ),
  update: async (id: string, payload: UpdateQuizRequest) =>
    quizSchema.parse(
      await api.patch<unknown>(`/quizzes/${encodeURIComponent(id)}`, payload),
    ),
  deleteQuiz: async (id: string) =>
    quizDeleteResponseSchema.parse(
      await api.delete<unknown>(`/quizzes/${encodeURIComponent(id)}`),
    ),
  addQuestion: async (id: string, payload: CreateQuizQuestionRequest) =>
    quizSchema.parse(
      await api.post<unknown>(
        `/quizzes/${encodeURIComponent(id)}/questions`,
        payload,
      ),
    ),
  updateQuestion: async (
    quizId: string,
    questionId: string,
    payload: UpdateQuizQuestionRequest,
  ) =>
    quizSchema.parse(
      await api.patch<unknown>(
        `/quizzes/${encodeURIComponent(quizId)}/questions/${encodeURIComponent(questionId)}`,
        payload,
      ),
    ),
  deleteQuestion: async (quizId: string, questionId: string) =>
    quizDeleteResponseSchema.parse(
      await api.delete<unknown>(
        `/quizzes/${encodeURIComponent(quizId)}/questions/${encodeURIComponent(questionId)}`,
      ),
    ),
  publish: async (id: string) =>
    quizSchema.parse(
      await api.post<unknown>(`/quizzes/${encodeURIComponent(id)}/publish`, {}),
    ),
  assign: async (
    courseId: string,
    lessonId: string,
    payload: AssignQuizRequest,
  ) =>
    quizAssignmentSchema.parse(
      await api.post<unknown>(
        `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/quiz-assignment`,
        payload,
      ),
    ),
  listCourseAssignments: async (courseId: string) =>
    courseQuizAssignmentsResponseSchema.parse(
      await api.get<unknown>(
        `/courses/${encodeURIComponent(courseId)}/quiz-assignments`,
      ),
    ),
  updateAssignment: async (id: string, payload: UpdateQuizAssignmentRequest) =>
    quizAssignmentSchema.parse(
      await api.patch<unknown>(
        `/quiz-assignments/${encodeURIComponent(id)}`,
        payload,
      ),
    ),
  deleteAssignment: async (id: string) =>
    quizDeleteResponseSchema.parse(
      await api.delete<unknown>(
        `/quiz-assignments/${encodeURIComponent(id)}`,
      ),
    ),
  listMineAssignments: async () =>
    myQuizAssignmentsResponseSchema.parse(
      await api.get<unknown>("/me/quizzes"),
    ),
  start: async (assignmentId: string) =>
    learnerQuizAttemptSchema.parse(
      await api.post<unknown>(
        `/quiz-assignments/${encodeURIComponent(assignmentId)}/attempts`,
        {},
      ),
    ),
  getAttempt: async (attemptId: string) =>
    learnerQuizAttemptSchema.parse(
      await api.get<unknown>(`/quiz-attempts/${encodeURIComponent(attemptId)}`),
    ),
  saveAnswers: async (attemptId: string, payload: BulkQuizAnswersRequest) => {
    const input = bulkQuizAnswersRequestSchema.parse(payload);
    return quizAnswerSyncResponseSchema.parse(
      await api.put<unknown>(
        `/quiz-attempts/${encodeURIComponent(attemptId)}/answers`,
        input,
      ),
    );
  },
  submit: async (attemptId: string) =>
    quizResultSchema.parse(
      await api.post<unknown>(
        `/quiz-attempts/${encodeURIComponent(attemptId)}/submit`,
        {},
      ),
    ),
  getResult: async (attemptId: string) =>
    quizResultSchema.parse(
      await api.get<unknown>(
        `/quiz-attempts/${encodeURIComponent(attemptId)}/result`,
      ),
    ),
  history: async () =>
    quizHistoryResponseSchema.parse(
      await api.get<unknown>("/me/quizzes/history"),
    ),
  assignmentAnalytics: async (assignmentId: string) =>
    quizAnalyticsSchema.parse(
      await api.get<unknown>(
        `/quiz-assignments/${encodeURIComponent(assignmentId)}/analytics`,
      ),
    ),
  courseAnalytics: async (courseId: string) =>
    courseQuizAnalyticsSchema.parse(
      await api.get<unknown>(
        `/courses/${encodeURIComponent(courseId)}/quiz-analytics`,
      ),
    ),
  studentReport: async (studentId: string) =>
    studentQuizReportSchema.parse(
      await api.get<unknown>(
        `/students/${encodeURIComponent(studentId)}/quiz-report`,
      ),
    ),
};
