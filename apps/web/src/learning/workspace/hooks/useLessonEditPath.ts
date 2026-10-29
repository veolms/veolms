import { getCourseEditorPath } from "../../../courses/courseEditorRouting";
import { CURRICULUM_PERMISSIONS } from "../../../courses/course-editor/curriculumPermissions";
import { isLearnerView } from "../../../lib/learner-view";
import { useCapabilities } from "../../../services/authorization/authorization.queries";
import { getUserRoles, isStaffRole } from "../../../shell/workspaceRole";

/**
 * Where the lesson page's "Edit" goes: the course editor's curriculum with
 * this lesson open in it. Only for someone who may change the curriculum or
 * its lessons (a curriculum permission that covers this course, as the
 * course cards decide it; an admin holds them all), and never in Student
 * view, which shows the page as a learner sees it. Null when there is no
 * such link.
 */
export function useLessonEditPath({
  user,
  course,
  sectionId,
  lessonId,
}: {
  user: unknown;
  course: { id: string; creatorId?: string | null } | null | undefined;
  sectionId: string | undefined;
  lessonId: string | undefined;
}): string | null {
  const roles = getUserRoles(user);
  const learnerView = isLearnerView();
  const capabilities = useCapabilities({
    enabled: isStaffRole(roles) && !learnerView,
  });
  if (learnerView || !course?.id || !sectionId || !lessonId) return null;
  const mayEdit = CURRICULUM_PERMISSIONS.some((permission) =>
    capabilities.canOnCourse(permission, course),
  );
  if (!mayEdit) return null;
  return getCourseEditorPath({
    mode: "edit",
    courseId: course.id,
    step: "curriculum",
    sectionId,
    lessonId,
  });
}
