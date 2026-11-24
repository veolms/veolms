import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CodingAiStreamEvent,
  CodingExercise,
  GenerateCodingExerciseRequest,
  ReviseCodingExerciseRequest,
  CodingLesson,
  LecturePracticeResponse,
  CreateCodingExerciseRequest,
  PublishCodingExerciseRequest,
  SubmitCodingRequest,
  UpdateCodingExerciseRequest,
} from "@veolms/contracts";
import { getApiError } from "../../lib/api-error";
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
    // The list shows the new status at once (from the run on this device);
    // the server's answer confirms it.
    onMutate: (payload) => {
      if (!lesson) return;
      const passed = payload.results.every((result) => result.passed);
      qc.setQueryData<LecturePracticeResponse["items"]>(
        codingKeys.coursePractice(lesson.assignment.courseId),
        (items) =>
          items?.map((item) =>
            item.assignmentId === lesson.assignment.id
              ? {
                  ...item,
                  status: item.status === "done" || passed ? "done" : "started",
                }
              : item,
          ),
      );
    },
    onSuccess: (data) => {
      if (!lesson) return;
      void qc.invalidateQueries({ queryKey: [...codingKeys.all, "stats"] });
      void qc.invalidateQueries({ queryKey: codingKeys.practiceCourses() });
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

export interface CodingAiProgress {
  stage: "context" | "writing" | "checking" | "saving";
  message: string;
  chars: number;
}

/**
 * Runs an AI writing request (a new question, or a change to one) while
 * showing its progress; Cancel stops it, and the AI call with it. The
 * finished question goes into the editor's cache.
 */
export function useCodingAiWriter(courseId: string) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<CodingAiProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (
      start: (
        onEvent: (event: CodingAiStreamEvent) => void,
        signal: AbortSignal,
      ) => Promise<CodingAiStreamEvent | null>,
    ): Promise<CodingExercise | null> => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setError(null);
      setSummary(null);
      setProgress({ stage: "context", message: "Starting…", chars: 0 });
      try {
        const last = await start((event) => {
          if (event.type === "progress")
            setProgress((current) => ({
              stage: event.stage,
              message: event.message,
              chars: event.chars ?? current?.chars ?? 0,
            }));
        }, abort.signal);
        if (abort.signal.aborted) return null;
        if (!last || last.type === "progress") {
          setError("The connection closed before the AI finished. Try again.");
          return null;
        }
        if (last.type === "error") {
          setError(last.message);
          return null;
        }
        qc.setQueryData(codingKeys.exercise(last.exercise.id), last.exercise);
        void qc.invalidateQueries({
          queryKey: codingKeys.courseExercises(courseId),
        });
        setSummary(last.summary);
        return last.exercise;
      } catch (caught) {
        if (abort.signal.aborted) return null;
        setError(getApiError(caught).message);
        return null;
      } finally {
        if (controller.current === abort) {
          controller.current = null;
          setProgress(null);
        }
      }
    },
    [courseId, qc],
  );

  const generate = useCallback(
    (payload: GenerateCodingExerciseRequest) =>
      run((onEvent, signal) =>
        codingPracticeService.generateWithAi(
          courseId,
          payload,
          onEvent,
          signal,
        ),
      ),
    [courseId, run],
  );
  const revise = useCallback(
    (exerciseId: string, payload: ReviseCodingExerciseRequest) =>
      run((onEvent, signal) =>
        codingPracticeService.reviseWithAi(
          exerciseId,
          payload,
          onEvent,
          signal,
        ),
      ),
    [run],
  );
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setProgress(null);
  }, []);

  return {
    generate,
    revise,
    cancel,
    running: progress !== null,
    progress,
    error,
    summary,
    clear: () => {
      setError(null);
      setSummary(null);
    },
  };
}
