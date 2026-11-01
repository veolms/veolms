/**
 * Whether a lesson update gives the lesson its first media: none is stored
 * and the update leaves it with some.
 *
 * That is the moment learners' progress on the lesson is cleared (see
 * `updateCourseLesson`): a lesson with no video is finished by opening it,
 * and once it has a video there is something to watch. Replacing one video
 * with another, saving the same one again, and taking media off are not
 * this, and leave progress alone.
 */
export function givesLessonItsFirstMedia(
  /** `content_media_id` as stored before the update. */
  storedMediaId: string | null,
  /** The media the lesson holds once the update is written. */
  mediaIdAfterUpdate: string | null | undefined,
): boolean {
  return storedMediaId === null && Boolean(mediaIdAfterUpdate);
}
