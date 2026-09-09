import type { CourseOverviewResponse } from "@veolms/contracts";

export const PUBLIC_PREVIEW_LESSON_LIMIT = 2;

export function canPlayCourseLesson(input: {
  allowGuestLearning: boolean;
  isAuthenticated: boolean;
  lessonNumber: number;
  publicPreviewLessonNumbers: ReadonlySet<number>;
}): boolean {
  return (
    input.allowGuestLearning ||
    input.isAuthenticated ||
    input.publicPreviewLessonNumbers.has(input.lessonNumber)
  );
}

/**
 * Returns the 1-based lesson numbers that anonymous visitors may play.
 *
 * Preview flags are the source of truth for courses that configure them. The
 * first two published lessons are a safe fallback for older courses without
 * preview flags.
 */
export function getPublicPreviewLessonNumbers(
  overview?: CourseOverviewResponse,
): number[] {
  if (!overview) {
    return [1, 2];
  }

  const lessons =
    overview?.sections
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((section) =>
        (section.lessons ?? []).slice().sort((a, b) => a.position - b.position),
      ) ?? [];
  const playableLessons = lessons.filter(
    (lesson) => lesson.contentType === "video" && lesson.isPublished,
  );

  const previewLessonNumbers = playableLessons
    .map((lesson, index) => (lesson.isPreview ? index + 1 : null))
    .filter((number): number is number => number !== null)
    .slice(0, PUBLIC_PREVIEW_LESSON_LIMIT);

  if (previewLessonNumbers.length > 0) return previewLessonNumbers;

  return playableLessons
    .slice(0, PUBLIC_PREVIEW_LESSON_LIMIT)
    .map((_, index) => index + 1);
}
