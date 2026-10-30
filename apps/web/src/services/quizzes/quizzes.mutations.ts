import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AssignQuizRequest,
  CreateQuizQuestionRequest,
  CreateQuizWithQuestionsRequest,
  SetQuizCoursePricingRequest,
  UpdateQuizAssignmentRequest,
  UpdateQuizQuestionRequest,
  UpdateQuizRequest,
} from "@veolms/contracts";
import { quizKeys } from "./quizzes.keys";
import { quizzesService } from "./quizzes.service";
import { trackAnalyticsEvent } from "../../lib/analytics-track";
export function useCreateQuizWithQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateQuizWithQuestionsRequest) =>
      quizzesService.createWithQuestions(payload),
    onSuccess: (data) => {
      qc.setQueryData(quizKeys.detail(data.id), data);
      void qc.invalidateQueries({ queryKey: quizKeys.mine() });
    },
  });
}
export function useUpdateQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateQuizRequest }) =>
      quizzesService.update(id, payload),
    // The response is the saved quiz. It goes straight into the cache;
    // refetching the same quiz after every autosave only repeated the read.
    onSuccess: (data, vars) => {
      qc.setQueryData(quizKeys.detail(vars.id), data);
    },
  });
}
export function useAddQuizQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateQuizQuestionRequest;
    }) => quizzesService.addQuestion(id, payload),
    onSuccess: (data, vars) => {
      qc.setQueryData(quizKeys.detail(vars.id), data);
    },
  });
}
export function useUpdateQuizQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      quizId,
      questionId,
      payload,
    }: {
      quizId: string;
      questionId: string;
      payload: UpdateQuizQuestionRequest;
    }) => quizzesService.updateQuestion(quizId, questionId, payload),
    onSuccess: (data, vars) => {
      qc.setQueryData(quizKeys.detail(vars.quizId), data);
    },
  });
}
export function useDeleteQuizQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      quizId,
      questionId,
    }: {
      quizId: string;
      questionId: string;
    }) => quizzesService.deleteQuestion(quizId, questionId),
    // The response is only an acknowledgement. Writing it into the quiz
    // cache replaced the quiz with `{ success: true }` and the builder
    // crashed on its next render.
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: quizKeys.detail(vars.quizId) });
    },
  });
}
export function usePublishQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quizzesService.publish,
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: quizKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: quizKeys.mine() });
    },
  });
}
export function useStartQuizAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quizzesService.start,
    onSuccess: (attempt) => {
      qc.setQueryData(quizKeys.attempt(attempt.id), attempt);
      void qc.invalidateQueries({ queryKey: quizKeys.mineAssignments() });
      trackAnalyticsEvent("quiz_started");
    },
  });
}
type SubmittedQuizResult = Awaited<ReturnType<typeof quizzesService.submit>>;
type CachedQuizAttempt = Awaited<ReturnType<typeof quizzesService.getAttempt>>;

/**
 * What the cache is told once an attempt has been handed in.
 *
 * The attempt is closed from here on, and the server refuses to read a
 * closed attempt as one in progress. Asking for it again (it is still on
 * screen when the answer arrives) only produced that refusal, so the cached
 * attempt is marked with the status the result carries instead. Anything
 * that opens it later sees at once that it is closed and shows the result,
 * which is cached here too.
 */
export function applySubmittedQuizAttempt(
  qc: QueryClient,
  result: SubmittedQuizResult,
): void {
  qc.setQueryData(quizKeys.result(result.attemptId), result);
  qc.setQueryData<CachedQuizAttempt>(
    quizKeys.attempt(result.attemptId),
    (attempt) => (attempt ? { ...attempt, status: result.status } : attempt),
  );
  void qc.invalidateQueries({ queryKey: quizKeys.mineAssignments() });
  void qc.invalidateQueries({ queryKey: quizKeys.history() });
}

export function useSubmitQuizAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quizzesService.submit,
    onSuccess: (result) => {
      applySubmittedQuizAttempt(qc, result);
      trackAnalyticsEvent("quiz_submitted", {
        props: { passed: Boolean(result.passed) },
      });
    },
  });
}
export function useAssignQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      lessonId,
      payload,
    }: {
      courseId: string;
      lessonId: string;
      payload: AssignQuizRequest;
    }) => quizzesService.assign(courseId, lessonId, payload),
    onSuccess: (assignment, vars) => {
      void qc.invalidateQueries({
        queryKey: quizKeys.courseAssignments(vars.courseId),
      });
      void qc.invalidateQueries({
        queryKey: quizKeys.detail(assignment.quizId),
      });
      void qc.invalidateQueries({
        queryKey: quizKeys.mineAssignments(),
      });
      void qc.invalidateQueries({
        queryKey: quizKeys.all,
      });
    },
  });
}
export function useUpdateQuizAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateQuizAssignmentRequest;
    }) => quizzesService.updateAssignment(id, payload),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: quizKeys.assignments() }),
  });
}

export function useDeleteQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quizId: string) => quizzesService.deleteQuiz(quizId),
    onSuccess: (_, quizId) => {
      qc.removeQueries({ queryKey: quizKeys.detail(quizId) });
      qc.setQueriesData({ queryKey: quizKeys.mine() }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.filter((q: { id?: string }) => q.id !== quizId);
      });
      qc.setQueriesData(
        { queryKey: quizKeys.assignments() },
        (old: unknown) => {
          if (!old) return old;
          if (Array.isArray(old)) {
            return old.filter((a: { quizId?: string }) => a.quizId !== quizId);
          }
          if (
            typeof old === "object" &&
            old !== null &&
            "assignments" in old &&
            Array.isArray((old as { assignments: unknown[] }).assignments)
          ) {
            return {
              ...(old as object),
              assignments: (
                old as { assignments: { quizId?: string }[] }
              ).assignments.filter((a) => a.quizId !== quizId),
            };
          }
          return old;
        },
      );
      void qc.invalidateQueries({ queryKey: quizKeys.all });
    },
  });
}

export function useDeleteQuizAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      quizzesService.deleteAssignment(assignmentId),
    onSuccess: (_, assignmentId) => {
      qc.setQueriesData(
        { queryKey: quizKeys.assignments() },
        (old: unknown) => {
          if (!old) return old;
          if (Array.isArray(old)) {
            return old.filter((a: { id?: string }) => a.id !== assignmentId);
          }
          if (
            typeof old === "object" &&
            old !== null &&
            "assignments" in old &&
            Array.isArray((old as { assignments: unknown[] }).assignments)
          ) {
            return {
              ...(old as object),
              assignments: (
                old as { assignments: { id?: string }[] }
              ).assignments.filter((a) => a.id !== assignmentId),
            };
          }
          return old;
        },
      );
      void qc.invalidateQueries({ queryKey: quizKeys.all });
    },
  });
}

/** Sets the quiz price for a whole course; every quiz attached to it shares it. */
export function useSetQuizCoursePricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: SetQuizCoursePricingRequest;
    }) => quizzesService.setCoursePricing(courseId, payload),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: quizKeys.all });
      void qc.invalidateQueries({
        queryKey: quizKeys.coursePricing(vars.courseId),
      });
    },
  });
}
