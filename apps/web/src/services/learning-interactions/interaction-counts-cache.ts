import type { QueryClient } from "@tanstack/react-query";
import { learningInteractionKeys } from "./learning-interactions.keys";

export type LessonInteractionCountKind = "comment" | "question" | "note";

export interface LessonInteractionCountsCache {
  comments: number;
  qna: number;
  notes: number;
  total: number;
}

export type LessonInteractionCountsSnapshot =
  Readonly<LessonInteractionCountsCache>;

type CountsQueryClient = Pick<QueryClient, "getQueryData" | "setQueryData">;

function countsKey(courseId: string, lessonId: string) {
  return learningInteractionKeys.lessonInteractionCounts(courseId, lessonId);
}

function countField(
  kind: LessonInteractionCountKind,
): "comments" | "qna" | "notes" {
  if (kind === "question") return "qna";
  if (kind === "note") return "notes";
  return "comments";
}

/**
 * Applies one top-level discussion delta only when the counts query already
 * exists. The returned snapshot is the rollback baseline for this operation.
 */
export function applyLessonInteractionCountDelta(
  queryClient: CountsQueryClient,
  input: {
    courseId: string;
    lessonId: string;
    kind: LessonInteractionCountKind;
    delta: 1 | -1;
  },
): LessonInteractionCountsSnapshot | undefined {
  const key = countsKey(input.courseId, input.lessonId);
  const previous = queryClient.getQueryData<LessonInteractionCountsCache>(key);
  if (!previous) return undefined;

  const field = countField(input.kind);
  const next: LessonInteractionCountsCache = {
    ...previous,
    [field]: Math.max(0, previous[field] + input.delta),
    total: Math.max(0, previous.total + input.delta),
  };
  queryClient.setQueryData(key, next);
  return { ...previous };
}

/**
 * Restores a failed optimistic operation without creating a cache that was
 * absent when the operation began.
 */
export function restoreLessonInteractionCounts(
  queryClient: CountsQueryClient,
  courseId: string,
  lessonId: string,
  snapshot: LessonInteractionCountsSnapshot | undefined,
): void {
  if (!snapshot) return;
  const key = countsKey(courseId, lessonId);
  if (
    queryClient.getQueryData<LessonInteractionCountsCache>(key) === undefined
  ) {
    return;
  }
  queryClient.setQueryData(key, { ...snapshot });
}
