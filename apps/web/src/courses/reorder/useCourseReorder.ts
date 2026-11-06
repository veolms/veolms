import { useState } from "react";
import type { ApiError } from "../../lib/api-error";
import { useMyCourses, useReorderCourses } from "../../services/courses";

/**
 * Saving the admin's course order, from the catalogue's cards or the
 * Reorder panel. It reads the admin's course list the catalogue already
 * loaded, so it asks the API for nothing more.
 */
export function useCourseReorder({
  enabled,
  setNotice,
}: {
  enabled: boolean;
  setNotice: (notice: string) => void;
}) {
  const myCourses = useMyCourses({ enabled });
  const mutation = useReorderCourses();
  const [panelOpen, setPanelOpen] = useState(false);

  async function save(courseIds: string[]): Promise<boolean> {
    try {
      await mutation.mutateAsync(courseIds);
      setNotice("Course order saved.");
      return true;
    } catch (error) {
      setNotice(
        (error as ApiError).code === "COURSE_ORDER_STALE"
          ? "The course list changed since it loaded. Reload and try again."
          : "The course order couldn’t be saved. Try again.",
      );
      return false;
    }
  }

  return {
    courses: myCourses.data?.courses ?? [],
    saving: mutation.isPending,
    save,
    panelOpen,
    setPanelOpen,
  };
}
