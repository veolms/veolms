export const COURSE_THUMBNAIL_SIZES =
  "(min-width: 1536px) 23vw, (min-width: 1280px) 31vw, (min-width: 560px) 47vw, 85vw";

export const LAZY_COURSE_THUMBNAIL_SIZES = `auto, ${COURSE_THUMBNAIL_SIZES}`;

export function getInitialCourseImagePriorityCount(viewportWidth: number) {
  if (viewportWidth < 560) return 1;
  if (viewportWidth < 1280) return 4;
  if (viewportWidth < 1536) return 6;
  return 8;
}

const PREFERRED_THUMBNAIL_FALLBACK_WIDTH = 640;

// `thumbnailUrl` is the original full-size object. Using it as `src` makes
// the browser download that file when srcset selection is unavailable, which
// is several times larger than the slot on a phone.
export function getCourseThumbnailFallbackUrl(
  thumbnailUrl: string,
  srcSet?: readonly { url: string; width: number }[] | null,
) {
  const variants = (srcSet ?? []).filter(
    (variant) => variant.url.length > 0 && variant.width > 0,
  );
  const exact = variants.find(
    (variant) => variant.width === PREFERRED_THUMBNAIL_FALLBACK_WIDTH,
  );
  if (exact) return exact.url;

  const nextLarger = variants
    .filter((variant) => variant.width > PREFERRED_THUMBNAIL_FALLBACK_WIDTH)
    .sort((left, right) => left.width - right.width)[0];
  if (nextLarger) return nextLarger.url;

  return variants.reduce<
    { url: string; width: number } | undefined
  >((largest, variant) => {
    if (!largest || variant.width > largest.width) return variant;
    return largest;
  }, undefined)?.url ?? thumbnailUrl;
}
