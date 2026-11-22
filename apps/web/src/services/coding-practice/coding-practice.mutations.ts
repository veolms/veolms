import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CodingLesson,
  CreateCodingExerciseRequest,
  PublishCodingExerciseRequest,
  SubmitCodingRequest,
  UpdateCodingExerciseRequest,
} from "@veolms/contracts";
import { codingKeys } from "./coding-practice.keys";
import { codingPracticeService } from "./coding-practice.service";

const courseListPrefix = [...codingKeys.all, "course-exercises"] as const;

export function useCreateCodingExercise(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCodingExerciseRequest) =>
      codingPracticeService.createExercise(courseId, payload),
    onSuccess: (data) => {
      qc.setQueryData(codingKeys.exercise(data.id), data);
      void qc.invalidateQueries({
        queryKey: codingKeys.courseExercises(courseId),
      });
    },
  });
}

/** Autosave: the saved exercise goes straight into the cache. */
export function useUpdateCodingExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseId,
      payload,
    }: {
      exerciseId: string;
      payload: UpdateCodingExerciseRequest;
    }) => codingPracticeService.updateExercise(exerciseId, payload),
    onSuccess: (data) => {
      qc.setQueryData(codingKeys.exercise(data.id), data);
      void qc.invalidateQueries({ queryKey: courseListPrefix });
    },
  });
}

export function usePublishCodingExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      exerciseId,
      payload,
    }: {
      exerciseId: string;
      payload: PublishCodingExerciseRequest;
    }) => codingPracticeService.publishExercise(exerciseId, payload),
    onSuccess: (data) => {
      qc.setQueryData(codingKeys.exercise(data.id), data);
      // Lectures that held it as a draft now show it to learners.
      void qc.invalidateQueries({ queryKey: courseListPrefix });
      void qc.invalidateQueries({
        queryKey: [...codingKeys.all, "lecture-practice"],
      });
      void qc.invalidateQueries({
        queryKey: [...codingKeys.all, "course-practice"],
      });
    },
  });
}

export function useDeleteCodingExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (exerciseId: string) =>
      codingPracticeService.deleteExercise(exerciseId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: courseListPrefix });
      void qc.invalidateQueries({
        queryKey: [...codingKeys.all, "lecture-practice"],
      });
      void qc.invalidateQueries({
        queryKey: [...codingKeys.all, "course-practice"],
      });
    },
  });
}

/** Records a submit; the learner's state goes into the practice cache. */
export function useSubmitCoding(lesson: CodingLesson | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitCodingRequest) =>
      codingPracticeService.submit(lesson!.assignment.id, payload),
    onSuccess: (data) => {
      if (!lesson) return;
      qc.setQueryData<CodingLesson>(
        codingKeys.practice(lesson.assignment.id),
        (current) => (current ? { ...current, state: data.state } : current),
      );
      void qc.invalidateQueries({
        queryKey: codingKeys.submissions(lesson.assignment.id),
      });
      // The same exercise may be listed in the course and under lectures.
      void qc.invalidateQueries({
        queryKey: codingKeys.coursePractice(lesson.assignment.courseId),
      });
      void qc.invalidateQueries({
        queryKey: [...codingKeys.all, "lecture-practice"],
      });
    },
  });
}

/**
 * Opening the solution is an action (the server records it), so it is a
 * mutation; what it returns is kept in the cache too, so the solution stays
 * shown when the learner switches tabs and comes back.
 */
export function useCodingSolution(lesson: CodingLesson | undefined) {
  const qc = useQueryClient();
  const key = codingKeys.solution(lesson?.assignment.id ?? "");
  const shown = useQuery({
    queryKey: key,
    queryFn: () => codingPracticeService.getSolution(lesson!.assignment.id),
    enabled: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
  const reveal = useMutation({
    mutationFn: () => codingPracticeService.getSolution(lesson!.assignment.id),
    onSuccess: (data) => {
      if (!lesson) return;
      qc.setQueryData(key, data);
      qc.setQueryData<CodingLesson>(
        codingKeys.practice(lesson.assignment.id),
        (current) => (current ? { ...current, state: data.state } : current),
      );
    },
  });
  return {
    data: shown.data ?? reveal.data,
    mutate: () => reveal.mutate(),
    isPending: reveal.isPending,
    error: reveal.error,
  };
}
