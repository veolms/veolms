import { ADMIN_ROLE } from "../../auth/index.ts";
import { isOpenFreeCourse } from "../../access/index.ts";
import type { OverviewViewer } from "./overview-visibility.ts";

/**
 * Whether a viewer may read a lesson's content: its description, which is
 * all a reading lesson has. The rule is the one lesson playback applies
 * (`assertPlaybackAccess` in the media service), so a lesson whose video is
 * locked does not hand out its text, and a lesson that plays shows it:
 *
 * - the course's creator and an admin always, in their Student view too, as
 *   their videos play there;
 * - anyone, signed in or not, for a preview lesson;
 * - anyone signed in on a free course that is not restricted, and a visitor
 *   who is not on that course's first lesson;
 * - anyone else only while they hold access to the course.
 *
 * `open` when the content may be shown, `login` when a visitor who signs in
 * might be shown it, `access` when the viewer is signed in and would have to
 * get the course.
 */
export type LessonContentAccess = "open" | "login" | "access";

export interface LessonContentViewer {
  viewer: OverviewViewer | undefined;
  course: { creator_id: string | null };
  pricingType: string | null | undefined;
  accessType: string | null | undefined;
  /**
   * Whether the viewer holds access to the course. Asked only when nothing
   * else opens the lesson, so the lookup is skipped where it cannot matter.
   */
  holdsCourse: () => Promise<boolean>;
}

/**
 * Whether a lesson's description is for everyone, whoever may play the
 * lesson. A video's or a quiz's description only says what the lesson is
 * about, so it is built into the lesson's page and the course's curriculum
 * like its title; a reading lesson's description is the lesson itself, and
 * it is read by `createLessonContentAccess`.
 */
export function isLessonDescriptionPublic(lesson: {
  content_type: string | null;
}): boolean {
  return lesson.content_type !== "document";
}

export function viewerIsCourseStaff(
  course: { creator_id: string | null },
  viewer: OverviewViewer | undefined,
): boolean {
  if (!viewer) return false;
  return (
    viewer.id === course.creator_id ||
    Boolean(viewer.previewsEveryCourse) ||
    Boolean(viewer.roles?.some((role) => role.toLowerCase() === ADMIN_ROLE))
  );
}

/**
 * Decides for each lesson of a course in turn. The viewer's hold on the
 * course is looked up once, the first time a lesson needs it.
 */
export function createLessonContentAccess({
  viewer,
  course,
  pricingType,
  accessType,
  holdsCourse,
}: LessonContentViewer) {
  const isStaff = viewerIsCourseStaff(course, viewer);
  const openFree = isOpenFreeCourse({
    pricing_type: pricingType,
    access_type: accessType,
  });
  let held: Promise<boolean> | undefined;

  return async function lessonContentAccess(lesson: {
    is_preview: boolean;
    /** The course's first published lesson, in the order learners meet it. */
    isFirstLesson: boolean;
  }): Promise<LessonContentAccess> {
    if (isStaff || lesson.is_preview) return "open";
    if (openFree && (viewer || lesson.isFirstLesson)) return "open";
    if (!viewer) return "login";
    held ??= holdsCourse();
    return (await held) ? "open" : "access";
  };
}

/**
 * The id of a course's first published lesson: the one playback numbers 1.
 * Sections in position order, then lessons in position order, then by id.
 */
export function findFirstPublishedLessonId(
  sections: readonly { id: string; position: number }[],
  lessons: readonly {
    id: string;
    section_id: string;
    position: number;
    is_published: boolean;
  }[],
): string | undefined {
  const sectionPosition = new Map(
    sections.map((section) => [section.id, section.position]),
  );
  let first: (typeof lessons)[number] | undefined;
  for (const lesson of lessons) {
    const section = sectionPosition.get(lesson.section_id);
    if (!lesson.is_published || section === undefined) continue;
    if (!first) {
      first = lesson;
      continue;
    }
    const firstSection = sectionPosition.get(first.section_id)!;
    if (
      section < firstSection ||
      (section === firstSection &&
        (lesson.position < first.position ||
          (lesson.position === first.position && lesson.id < first.id)))
    ) {
      first = lesson;
    }
  }
  return first?.id;
}
