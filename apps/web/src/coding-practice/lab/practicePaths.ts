/** /practice, /practice/<course>, /practice/<course>/<question>. */
export function practicePath(courseSlug?: string, assignmentId?: string) {
  if (!courseSlug) return "/practice";
  const course = `/practice/${encodeURIComponent(courseSlug)}`;
  return assignmentId
    ? `${course}/${encodeURIComponent(assignmentId)}`
    : course;
}

/** Where Back from a question goes: the page the learner came from. */
export interface PracticeReturn {
  practiceFrom?: string;
  /**
   * False when the question replaced that page in the history (an older
   * `?practice=` lecture link): Back then opens `practiceFrom` instead of
   * stepping back, which would leave the site or loop.
   */
  practiceBack?: boolean;
}

export function returnPathOf(state: unknown): string | null {
  const from = (state as PracticeReturn | null)?.practiceFrom;
  return typeof from === "string" &&
    from.startsWith("/") &&
    !from.startsWith("//")
    ? from
    : null;
}

/**
 * True when the history entry before this one is the page in
 * `practiceFrom`: the question was pushed from it, and the browser has an
 * earlier entry of this app (React Router numbers them in `idx`).
 */
export function canStepBack(state: unknown): boolean {
  if (!returnPathOf(state)) return false;
  if ((state as PracticeReturn | null)?.practiceBack === false) return false;
  if (typeof window === "undefined") return false;
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}
