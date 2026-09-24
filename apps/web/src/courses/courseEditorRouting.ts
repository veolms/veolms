export const COURSE_EDITOR_STEP_IDS = [
  "basics",
  "curriculum",
  "access-rules",
  "pricing",
  "extras",
  "publish",
] as const;

export type CourseEditorStepId = (typeof COURSE_EDITOR_STEP_IDS)[number];

const COURSE_EDITOR_STEP_PATTERN = COURSE_EDITOR_STEP_IDS.join("|");

const normalizeEditorPath = (pathname: string) =>
  (String(pathname).split(/[?#]/, 1)[0] ?? "").replace(/\/+$/, "") || "/";

export function isCourseCreateEditorPath(pathname: string): boolean {
  const path = normalizeEditorPath(pathname);
  return (
    path === "/courses/create" ||
    new RegExp(`^/courses/create/(?:${COURSE_EDITOR_STEP_PATTERN})$`).test(path)
  );
}

export function isCourseEditEditorPath(pathname: string): boolean {
  const path = normalizeEditorPath(pathname);
  return new RegExp(
    `^/courses/[^/]+/edit/(?:${COURSE_EDITOR_STEP_PATTERN})$`,
  ).test(path);
}

export function isCourseEditorPath(pathname: string): boolean {
  return isCourseCreateEditorPath(pathname) || isCourseEditEditorPath(pathname);
}

export function getCourseEditorPath({
  mode,
  courseId,
  step,
  sectionId,
  lessonId,
}: {
  mode: "create" | "edit";
  courseId?: string | null;
  step: CourseEditorStepId;
  sectionId?: string | null;
  lessonId?: string | null;
}): string {
  const path =
    mode === "edit" && courseId
      ? `/courses/${encodeURIComponent(courseId)}/edit/${step}`
      : `/courses/create/${step}`;

  const params = new URLSearchParams();
  if (step === "curriculum" && sectionId) {
    params.set("sectionId", sectionId);
  }
  if (step === "curriculum" && lessonId) {
    params.set("lessonId", lessonId);
  }

  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
