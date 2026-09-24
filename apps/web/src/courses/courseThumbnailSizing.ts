export const COURSE_THUMBNAIL_SIZES =
  "(min-width: 1536px) 23vw, (min-width: 1280px) 31vw, (min-width: 560px) 47vw, 100vw";

export function getInitialCourseImagePriorityCount(viewportWidth: number) {
  if (viewportWidth < 560) return 2;
  if (viewportWidth < 1280) return 4;
  if (viewportWidth < 1536) return 6;
  return 8;
}
