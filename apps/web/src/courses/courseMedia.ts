const COURSE_MEDIA_CDN_BASE_URL = String(
  import.meta.env.VITE_COURSE_MEDIA_BASE_URL || "",
).replace(/\/+$/, "");

export const COURSE_THUMBNAIL_WIDTHS = [160, 240, 320, 480, 640, 960, 1280] as const;

export function getCourseThumbnailCdnUrl(
  mediaId: string | null | undefined,
  width: number | "full" = "full",
): string | undefined {
  if (!mediaId || !COURSE_MEDIA_CDN_BASE_URL) return undefined;
  return `${COURSE_MEDIA_CDN_BASE_URL}/thumbnails/${encodeURIComponent(mediaId)}/processed/${width}.webp`;
}

export function getCourseThumbnailCdnSrcSet(mediaId: string | null | undefined) {
  return COURSE_THUMBNAIL_WIDTHS.flatMap((width) => {
    const url = getCourseThumbnailCdnUrl(mediaId, width);
    return url ? [{ url, width, height: Math.round(width * 9 / 16) }] : [];
  });
}
