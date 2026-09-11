import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "../../lib/api-error";
import type {
  AssignQuizRequest,
  BulkQuizAnswersRequest,
  CreateQuizQuestionRequest,
  CreateQuizRequest,
  UpdateQuizAssignmentRequest,
  UpdateQuizQuestionRequest,
  UpdateQuizRequest,
} from "@veolms/contracts";
import { quizKeys } from "./quizzes.keys";
import { quizzesService } from "./quizzes.service";
export function useCreateQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateQuizRequest) => quizzesService.create(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: quizKeys.mine() }),
  });
}
export function useUpdateQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateQuizRequest }) =>
      quizzesService.update(id, payload),
    onSuccess: (_, vars) =>
      void qc.invalidateQueries({ queryKey: quizKeys.detail(vars.id) }),
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
    onSuccess: (_, vars) =>
      void qc.invalidateQueries({ queryKey: quizKeys.detail(vars.id) }),
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
    onSuccess: (_, vars) =>
      void qc.invalidateQueries({ queryKey: quizKeys.detail(vars.quizId) }),
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
    onSuccess: (_, vars) =>
      void qc.invalidateQueries({ queryKey: quizKeys.detail(vars.quizId) }),
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
export function useSaveQuizAnswers() {
  const qc = useQueryClient();
  return useMutation<
    { saved: true; answerCount: number },
    ApiError,
    { attemptId: string; payload: BulkQuizAnswersRequest }
  >({
    mutationFn: ({ attemptId, payload }) =>
      quizzesService.saveAnswers(attemptId, payload),
    onSuccess: (_, vars) =>
      void qc.invalidateQueries({ queryKey: quizKeys.attempt(vars.attemptId) }),
  });
}
export function useStartQuizAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quizzesService.start,
    onSuccess: (attempt) => {
      qc.setQueryData(quizKeys.attempt(attempt.id), attempt);
      void qc.invalidateQueries({ queryKey: quizKeys.mineAssignments() });
    },
  });
}
export function useSubmitQuizAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quizzesService.submit,
    onSuccess: (result) => {
      qc.setQueryData(quizKeys.result(result.attemptId), result);
      void qc.invalidateQueries({
        queryKey: quizKeys.attempt(result.attemptId),
      });
      void qc.invalidateQueries({ queryKey: quizKeys.mineAssignments() });
      void qc.invalidateQueries({ queryKey: quizKeys.history() });
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
