import { createContext, useContext, useState, type ReactNode } from "react";
import { getCourseThumbnailCdnUrl } from "../courses/courseMedia";

export interface DiscussionCourseThumbnailSource {
  url?: string | null;
  mediaId?: string | null;
}

/**
 * The thumbnails of the Discussions page's courses, by course id, from the
 * page's own course list, so a row can show its course's picture.
 */
export const DiscussionCourseThumbnailsContext = createContext<
  ReadonlyMap<string, DiscussionCourseThumbnailSource>
>(new Map());

export function useDiscussionCourseThumbnail(courseId: string) {
  return useContext(DiscussionCourseThumbnailsContext).get(courseId);
}

/**
 * A course's picture, small: its stored address first, then the CDN's
 * 160px copy. When none loads, `fallback` (or nothing) is shown instead of
 * a broken picture.
 */
export function DiscussionCourseThumbnail({
  thumbnail,
  className,
  fallback = null,
}: {
  thumbnail: DiscussionCourseThumbnailSource | undefined;
  className: string;
  fallback?: ReactNode;
}) {
  const sources = [
    thumbnail?.url?.trim(),
    getCourseThumbnailCdnUrl(thumbnail?.mediaId, 160),
  ].filter(
    (source, index, all): source is string =>
      Boolean(source) && all.indexOf(source) === index,
  );
  const key = sources.join("|");
  const [failed, setFailed] = useState({ key, count: 0 });
  const failedCount = failed.key === key ? failed.count : 0;
  const source = sources[failedCount];
  if (!source) return <>{fallback}</>;
  return (
    <img
      src={source}
      alt=""
      width={160}
      height={90}
      loading="lazy"
      decoding="async"
      onError={() => setFailed({ key, count: failedCount + 1 })}
      className={className}
    />
  );
}
