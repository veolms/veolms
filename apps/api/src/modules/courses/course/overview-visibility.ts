import { ADMIN_ROLE } from "../../auth/index.ts";

/**
 * Who is looking at a course overview, and how much of the course that
 * shows them. The overview and the per-lesson description endpoint both ask
 * here, so a lesson's description is never shown by one and withheld by the
 * other.
 */
export interface OverviewViewer {
  id: string;
  roles?: readonly string[];
  /** Answer as for a learner: see `LEARNER_VIEW_HEADER`. */
  learnerView?: boolean;
  /**
   * Holds course.preview through a role that reaches every course (a
   * reviewer, a content editor): may open any draft and its lessons.
   */
  previewsEveryCourse?: boolean;
}

export interface OverviewVisibility {
  /**
   * Whether the viewer may open the course at all. A draft is visible to
   * its creator and to admins only: another instructor's role does not open
   * someone else's unpublished course.
   */
  mayOpen: boolean;
  /**
   * Its creator and an admin are shown the course as they manage it, unless
   * they are in their Student view. Whether they may open a draft at all
   * does not depend on the view.
   */
  managesCourse: boolean;
}

export function resolveOverviewVisibility(
  course: { status: string; creator_id: string | null },
  viewer: OverviewViewer | undefined,
): OverviewVisibility {
  const isOwner = Boolean(viewer && viewer.id === course.creator_id);
  const isAdmin = Boolean(viewer?.roles?.includes(ADMIN_ROLE));
  const isStaff = isOwner || isAdmin;
  return {
    mayOpen:
      course.status === "published" ||
      isStaff ||
      Boolean(viewer?.previewsEveryCourse),
    managesCourse: isStaff && !viewer?.learnerView,
  };
}

/** Learners get published lessons only; whoever manages the course, all. */
export function isLessonListedInOverview(
  lesson: { is_published: boolean },
  visibility: Pick<OverviewVisibility, "managesCourse">,
): boolean {
  return visibility.managesCourse || lesson.is_published;
}
