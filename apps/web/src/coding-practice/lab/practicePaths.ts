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
}

export function returnPathOf(state: unknown): string | null {
  const from = (state as PracticeReturn | null)?.practiceFrom;
  return typeof from === "string" && from.startsWith("/") ? from : null;
}
