import {
  codingAiStreamEventSchema,
  codingAssignmentAnalyticsSchema,
  codingPracticeStatsSchema,
  practiceCoursesResponseSchema,
  type CodingAiStreamEvent,
  type GenerateCodingExerciseRequest,
  type ReviseCodingExerciseRequest,
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
import { api, getApiError, getApiRequestUrl } from "../../lib/api-client";

const id = encodeURIComponent;

/**
 * POSTs and reads the NDJSON answer line by line. Resolves with the last
 * event (done or error). A refused request (no permission, invalid body)
 * comes back as plain JSON and is thrown as an ApiError.
 */
async function streamAi(
  path: string,
  payload: unknown,
  onEvent: (event: CodingAiStreamEvent) => void,
  signal: AbortSignal,
): Promise<CodingAiStreamEvent | null> {
  const response = await fetch(getApiRequestUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    const error = (
      body as { error?: { code?: string; message?: string } } | null
    )?.error;
    throw getApiError({
      status: response.status,
      code: error?.code ?? "AI_REQUEST_FAILED",
      message: error?.message ?? "The request failed. Try again.",
    });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: CodingAiStreamEvent | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return;
    }
    const parsed = codingAiStreamEventSchema.safeParse(json);
    if (!parsed.success) return;
    last = parsed.data;
    onEvent(parsed.data);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      take(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  }
  take(buffer);
  return last;
}

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

  /* AI writing: answered line by line while the AI works */
  generateWithAi: (
    courseId: string,
    payload: GenerateCodingExerciseRequest,
    onEvent: (event: CodingAiStreamEvent) => void,
    signal: AbortSignal,
  ) =>
    streamAi(
      `/courses/${id(courseId)}/coding-exercises/ai`,
      payload,
      onEvent,
      signal,
    ),
  reviseWithAi: (
    exerciseId: string,
    payload: ReviseCodingExerciseRequest,
    onEvent: (event: CodingAiStreamEvent) => void,
    signal: AbortSignal,
  ) =>
    streamAi(
      `/coding-exercises/${id(exerciseId)}/ai/revise`,
      payload,
      onEvent,
      signal,
    ),

  /* learner */
  getStats: async (courseId: string | null) =>
    codingPracticeStatsSchema.parse(
      await api.get<unknown>("/practice/me", {
        params: courseId ? { courseId } : {},
      }),
    ),
  listPracticeCourses: async () =>
    practiceCoursesResponseSchema.parse(
      await api.get<unknown>("/practice/courses"),
    ).courses,
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
  /** `preview`: staff open the newest version, as a student sees it. */
  getPractice: async (assignmentId: string, preview = false) =>
    codingLessonSchema.parse(
      await api.get<unknown>(
        `/coding-assignments/${id(assignmentId)}${preview ? "?preview=1" : ""}`,
      ),
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
  getSolution: async (assignmentId: string, preview = false) =>
    codingSolutionResponseSchema.parse(
      await api.post<unknown>(
        `/coding-assignments/${id(assignmentId)}/solution${preview ? "?preview=1" : ""}`,
      ),
    ),
};
