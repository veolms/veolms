import type { QueryClient } from "@tanstack/react-query";
import { learningInteractionKeys } from "./learning-interactions.keys";

export type LessonInteractionCountKind = "comment" | "question" | "note";

export interface LessonInteractionCountsCache {
  comments: number;
  qna: number;
  notes: number;
  total: number;
}

export interface LessonInteractionCountChange {
  readonly kind: LessonInteractionCountKind;
  /** The actual field delta applied to the cache. */
  readonly fieldDelta: number;
  /** The actual total delta applied to the cache. */
  readonly totalDelta: number;
}

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
 * exists. The returned change describes only this operation's contribution so
 * overlapping optimistic operations can roll back independently.
 */
export function applyLessonInteractionCountDelta(
  queryClient: CountsQueryClient,
  input: {
    courseId: string;
    lessonId: string;
    kind: LessonInteractionCountKind;
    delta: 1 | -1;
  },
): LessonInteractionCountChange | undefined {
  const key = countsKey(input.courseId, input.lessonId);
  const previous = queryClient.getQueryData<LessonInteractionCountsCache>(key);
  if (!previous) return undefined;

  const field = countField(input.kind);
  const nextField = Math.max(0, previous[field] + input.delta);
  const nextTotal = Math.max(0, previous.total + input.delta);
  const next: LessonInteractionCountsCache = {
    ...previous,
    [field]: nextField,
    total: nextTotal,
  };
  queryClient.setQueryData(key, next);
  return {
    kind: input.kind,
    fieldDelta: nextField - previous[field],
    totalDelta: nextTotal - previous.total,
  };
}

/**
 * Rolls back only one optimistic operation without creating a cache that was
 * absent when the operation began.
 */
export function restoreLessonInteractionCounts(
  queryClient: CountsQueryClient,
  courseId: string,
  lessonId: string,
  change: LessonInteractionCountChange | undefined,
): void {
  if (!change) return;
  const key = countsKey(courseId, lessonId);
  const current = queryClient.getQueryData<LessonInteractionCountsCache>(key);
  if (!current) return;

  const field = countField(change.kind);
  queryClient.setQueryData(key, {
    ...current,
    [field]: Math.max(0, current[field] - change.fieldDelta),
    total: Math.max(0, current.total - change.totalDelta),
  });
}
