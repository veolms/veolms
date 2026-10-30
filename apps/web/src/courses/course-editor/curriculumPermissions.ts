import type { Permission } from "@veolms/contracts";

/**
 * What opens a course's curriculum: its sections, or any lesson action. The
 * curriculum shows each action only to whoever holds its own key. Kept apart
 * from the wizard's step list so the course card can read it without the
 * step icons.
 */
export const CURRICULUM_PERMISSIONS: readonly Permission[] = [
  "course.curriculum.update",
  "lesson.create",
  "lesson.details.update",
  "lesson.content.update",
  "lesson.video.update",
  "lesson.video.import_youtube",
  "lesson.reorder",
  "lesson.publish",
  "lesson.delete",
];
