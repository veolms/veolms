import {
  codingAssignmentAnalyticsSchema,
  codingExerciseSchema,
  codingLessonSchema,
  codingSolutionResponseSchema,
  codingSubmissionsResponseSchema,
  courseCodingExercisesResponseSchema,
  lecturePracticeResponseSchema,
  saveCodingDraftResponseSchema,
  submitCodingResponseSchema,
  type CreateCodingExerciseRequest,
  type PublishCodingExerciseRequest,
  type SaveCodingDraftRequest,
  type SubmitCodingRequest,
  type UpdateCodingExerciseRequest,
} from "@veolms/contracts";
import { api, getApiRequestUrl } from "../../lib/api-client";

const id = encodeURIComponent;

export const codingPracticeService = {
  /* authoring (course editor) */
  listCourseExercises: async (courseId: string) =>
    courseCodingExercisesResponseSchema.parse(
      await api.get<unknown>(`/courses/${id(courseId)}/coding-exercises`),
    ).exercises,
  createExercise: async (
    courseId: string,
    payload: CreateCodingExerciseRequest,
  ) =>
    codingExerciseSchema.parse(
      await api.post<unknown>(
        `/courses/${id(courseId)}/coding-exercises`,
        payload,
      ),
    ),
  getExercise: async (exerciseId: string) =>
    codingExerciseSchema.parse(
      await api.get<unknown>(`/coding-exercises/${id(exerciseId)}`),
    ),
  updateExercise: async (
    exerciseId: string,
    payload: UpdateCodingExerciseRequest,
  ) =>
    codingExerciseSchema.parse(
      await api.patch<unknown>(`/coding-exercises/${id(exerciseId)}`, payload),
    ),
  publishExercise: async (
    exerciseId: string,
    payload: PublishCodingExerciseRequest,
  ) =>
    codingExerciseSchema.parse(
      await api.post<unknown>(
        `/coding-exercises/${id(exerciseId)}/publish`,
        payload,
      ),
    ),
  deleteExercise: async (exerciseId: string) => {
    await api.delete<unknown>(`/coding-exercises/${id(exerciseId)}`);
  },
  getAnalytics: async (assignmentId: string) =>
    codingAssignmentAnalyticsSchema.parse(
      await api.get<unknown>(
        `/coding-assignments/${id(assignmentId)}/analytics`,
      ),
    ),
  getLearnerSubmissions: async (assignmentId: string, studentId: string) =>
    codingSubmissionsResponseSchema.parse(
      await api.get<unknown>(
        `/coding-assignments/${id(assignmentId)}/students/${id(studentId)}/submissions`,
      ),
    ).submissions,

  /* learner */
  listCoursePractice: async (courseId: string) =>
    lecturePracticeResponseSchema.parse(
      await api.get<unknown>(`/courses/${id(courseId)}/practice`),
    ).items,
  listLecturePractice: async (courseId: string, lessonId: string) =>
    lecturePracticeResponseSchema.parse(
      await api.get<unknown>(
        `/courses/${id(courseId)}/lessons/${id(lessonId)}/practice`,
      ),
    ).items,
  getPractice: async (assignmentId: string) =>
    codingLessonSchema.parse(
      await api.get<unknown>(`/coding-assignments/${id(assignmentId)}`),
    ),
  saveDraft: async (assignmentId: string, payload: SaveCodingDraftRequest) =>
    saveCodingDraftResponseSchema.parse(
      await api.put<unknown>(
        `/coding-assignments/${id(assignmentId)}/draft`,
        payload,
      ),
    ),
  /**
   * The draft as the page goes away: a keepalive request outlives the page.
   * Browsers cap keepalive bodies at 64 KB; a larger draft stays on the
   * device and is sent the next time the exercise opens.
   */
  saveDraftOnLeave(assignmentId: string, payload: SaveCodingDraftRequest) {
    const body = JSON.stringify(payload);
    if (body.length > 60_000) return;
    void fetch(
      getApiRequestUrl(`/coding-assignments/${id(assignmentId)}/draft`),
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      },
    ).catch(() => undefined);
  },
  submit: async (assignmentId: string, payload: SubmitCodingRequest) =>
    submitCodingResponseSchema.parse(
      await api.post<unknown>(
        `/coding-assignments/${id(assignmentId)}/submissions`,
        payload,
      ),
    ),
  listSubmissions: async (assignmentId: string) =>
    codingSubmissionsResponseSchema.parse(
      await api.get<unknown>(
        `/coding-assignments/${id(assignmentId)}/submissions`,
      ),
    ).submissions,
  getSolution: async (assignmentId: string) =>
    codingSolutionResponseSchema.parse(
      await api.post<unknown>(
        `/coding-assignments/${id(assignmentId)}/solution`,
      ),
    ),
};
