import type { Course } from "./catalogue";

// Keep this aligned with CourseCatalogue's responsive grid and image slot.
export const courseThumbnailSizes =
  "(min-width: 1536px) 23vw, (min-width: 1280px) 31vw, (min-width: 560px) 47vw, 100vw";

export const getCourseThumbnailSrcSet = (course: Pick<Course, "thumbnailSrcSet">) =>
  course.thumbnailSrcSet?.map((variant) => `${variant.url} ${variant.width}w`).join(", ");
