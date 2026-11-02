const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a YouTube import is for: the saved course and lesson, when there are. */
export interface YoutubeImportTarget {
  courseId: string | null;
  /**
   * Null while the lesson is not saved yet (it has a temporary id): the
   * editor then attaches the finished video itself, as it does an upload.
   */
  lessonId: string | null;
}

/**
 * The course and lesson a YouTube import from this lesson editor goes into.
 * An unsaved course or lesson has no real id yet, so it is left out.
 */
export function getYoutubeImportTarget(
  courseId: string | null | undefined,
  lessonId: string,
  isPendingCreation = false,
): YoutubeImportTarget {
  const savedCourseId =
    courseId && UUID_PATTERN.test(courseId) ? courseId : null;
  const savedLessonId =
    savedCourseId && !isPendingCreation && UUID_PATTERN.test(lessonId)
      ? lessonId
      : null;
  return { courseId: savedCourseId, lessonId: savedLessonId };
}
