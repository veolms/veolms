import type { Course } from "./catalogue";

// Keep this aligned with CourseCatalogue's responsive grid and image slot.
// Phone cards render ~81vw wide (page padding + card inset), so the 88vw
// leg keeps a safety margin while letting DPR-1.75/2 phones pick the 640px
// variant (~45KB) instead of the 960px one (~90KB) for the LCP image.
export const courseThumbnailSizes =
  "(min-width: 1536px) 23vw, (min-width: 1280px) 31vw, (min-width: 560px) 47vw, 88vw";

export const getCourseThumbnailSrcSet = (
  course: Pick<Course, "thumbnailSrcSet">,
) =>
  course.thumbnailSrcSet
    ?.map((variant) => `${variant.url} ${variant.width}w`)
    .join(", ");
