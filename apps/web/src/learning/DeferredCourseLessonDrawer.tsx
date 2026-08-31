import { lazy, Suspense } from "react";

import type { CourseLessonDrawerProps } from "./CourseLessonDrawer";

let courseLessonDrawerModule:
  Promise<typeof import("./CourseLessonDrawer")> | undefined;

const loadCourseLessonDrawer = () => {
  courseLessonDrawerModule ??= import("./CourseLessonDrawer");
  return courseLessonDrawerModule;
};

const LazyCourseLessonDrawer = lazy(async () => {
  const module = await loadCourseLessonDrawer();
  return { default: module.CourseLessonDrawer };
});

interface DeferredCourseLessonDrawerProps extends CourseLessonDrawerProps {
  requested: boolean;
}

/** Defers the drawer runtime until the course curriculum is first opened. */
export function DeferredCourseLessonDrawer({
  requested,
  ...props
}: DeferredCourseLessonDrawerProps) {
  if (!requested) return null;

  return (
    <Suspense fallback={null}>
      <LazyCourseLessonDrawer {...props} />
    </Suspense>
  );
}
