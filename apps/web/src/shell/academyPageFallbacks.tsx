import { use } from "react";
import { CourseEditorSkeleton } from "../courses/course-editor/CourseEditorSkeleton";
import { AcademyRouteSkeleton } from "../routing/AcademyRouteSkeleton";

export function CourseEditorRouteFallback() {
  return <CourseEditorSkeleton />;
}

export function AcademyPageFallback() {
  return <AcademyRouteSkeleton />;
}

const neverSettles = new Promise<never>(() => {});

/**
 * Keeps the dashboard's placeholder up for as long as it is rendered: it is
 * never ready, so the boundary around it goes on showing its fallback.
 */
export function DashboardOnItsWay(): null {
  use(neverSettles);
  return null;
}
