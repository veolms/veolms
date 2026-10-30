import type { CourseEditorSectionContribution } from "@veolms/web-core";
import { useWebContributions } from "../../lib/web-contributions";
import { useCurrentUser } from "../../services/auth";
import { hasAdminRole } from "../../shell/workspaceRole";

/**
 * The sections plugins added to one step of the course editor (see
 * registerCourseEditorSection), after the step's own cards. A section
 * marked admin-only is left out for everyone else.
 */
export function PluginCourseEditorSections({
  step,
  courseId,
  courseSlug,
  notify,
}: {
  step: CourseEditorSectionContribution["step"];
  courseId: string | null | undefined;
  courseSlug: string | null | undefined;
  notify: (message: string) => void;
}) {
  const { courseEditorSections } = useWebContributions();
  const { data: currentUser } = useCurrentUser();
  // A course not saved yet has nothing for a section to set.
  if (!courseId || !courseSlug) return null;

  const isAdmin = hasAdminRole(currentUser?.roles);
  return courseEditorSections
    .filter((section) => section.step === step)
    .filter((section) => !section.adminOnly || isAdmin)
    .map(({ id, component: Section }) => (
      <Section
        key={id}
        courseId={courseId}
        courseSlug={courseSlug}
        notify={notify}
      />
    ));
}
