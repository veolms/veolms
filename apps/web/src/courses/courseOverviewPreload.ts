type CourseOverviewModule = typeof import("./CourseOverviewPage");

let courseOverviewModulePromise: Promise<CourseOverviewModule> | null = null;

export function loadCourseOverviewPage() {
  return (courseOverviewModulePromise ??= import("./CourseOverviewPage"));
}

export function preloadCourseOverviewPage(): void {
  void loadCourseOverviewPage();
}
