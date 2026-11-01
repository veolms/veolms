import { use } from "react";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { AcademyRouteSkeleton } from "../routing/AcademyRouteSkeleton";

export function CourseEditorRouteFallback() {
  return (
    <CenteredLoadingSpinner
      label="Loading course editor"
      className="min-h-[calc(100dvh-10rem)] w-full"
    />
  );
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
