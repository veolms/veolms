import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateQuizQuestionRequest,
  GenerateQuizAiRequest,
  QuestionGenerationJob,
  QuizAiStreamEvent,
  ReviseQuizQuestionAiRequest,
  StartQuestionGenerationRequest,
} from "@veolms/contracts";
import { getApiError } from "../../lib/api-client";
import { codingKeys } from "../coding-practice/coding-practice.keys";
import { quizKeys } from "../quizzes/quizzes.keys";
import { questionAiKeys } from "./question-ai.keys";
import { questionAiService } from "./question-ai.service";

export interface QuizAiProgress {
  stage: "context" | "writing" | "checking";
  message: string;
  chars: number;
}

export interface QuizAiResult {
  title: string;
  questions: CreateQuizQuestionRequest[];
  summary: string;
}

/**
 * Runs an AI quiz request (a lecture's questions, or a change to one) while
 * showing its progress; Cancel stops it and the AI call with it. Nothing is
 * saved: the caller puts the result in the quiz editor.
 */
export function useQuizAiWriter(courseId: string, lessonId: string) {
  const [progress, setProgress] = useState<QuizAiProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (
      start: (
        onEvent: (event: QuizAiStreamEvent) => void,
        signal: AbortSignal,
      ) => Promise<QuizAiStreamEvent | null>,
    ): Promise<QuizAiResult | null> => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setError(null);
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
        return {
          title: last.title,
          questions: last.questions,
          summary: last.summary,
        };
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
    [],
  );

  const write = useCallback(
    (payload: GenerateQuizAiRequest) =>
      run((onEvent, signal) =>
        questionAiService.writeQuiz(
          courseId,
          lessonId,
          payload,
          onEvent,
          signal,
        ),
      ),
    [courseId, lessonId, run],
  );
  const revise = useCallback(
    (payload: ReviseQuizQuestionAiRequest) =>
      run((onEvent, signal) =>
        questionAiService.reviseQuestion(
          courseId,
          lessonId,
          payload,
          onEvent,
          signal,
        ),
      ),
    [courseId, lessonId, run],
  );
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setProgress(null);
  }, []);

  return {
    write,
    revise,
    cancel,
    running: progress !== null,
    progress,
    error,
    clearError: () => setError(null),
  };
}

/** What a run made changes the course's quizzes and coding questions. */
function useRefreshAfterRun(courseId: string) {
  const qc = useQueryClient();
  return useCallback(
    (job: QuestionGenerationJob) => {
      qc.setQueryData(questionAiKeys.latestJob(courseId), job);
      void qc.invalidateQueries({ queryKey: quizKeys.all });
      void qc.invalidateQueries({ queryKey: codingKeys.all });
    },
    [courseId, qc],
  );
}

export function useStartQuestionJob(courseId: string) {
  const refresh = useRefreshAfterRun(courseId);
  return useMutation({
    mutationFn: (payload: StartQuestionGenerationRequest) =>
      questionAiService.startJob(courseId, payload),
    onSuccess: refresh,
  });
}

export function useCancelQuestionJob(courseId: string) {
  const refresh = useRefreshAfterRun(courseId);
  return useMutation({
    mutationFn: (jobId: string) => questionAiService.cancelJob(jobId),
    onSuccess: refresh,
  });
}

export function usePublishGeneratedQuizzes(courseId: string) {
  const refresh = useRefreshAfterRun(courseId);
  return useMutation({
    mutationFn: ({ jobId, quizIds }: { jobId: string; quizIds?: string[] }) =>
      questionAiService.publishQuizzes(jobId, quizIds),
    onSuccess: refresh,
  });
}
