import type { EnrolledCourse } from "@veolms/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { courseCardShimmerClass } from "../../courses/courseCardShimmer";
import { getCourseThumbnailCdnUrl } from "../../courses/courseMedia";
import {
  rememberShownCourseThumbnail,
  useCourseThumbnailShownBefore,
} from "../../courses/courseThumbnailMemory";
import {
  THUMBNAIL_RETRIES,
  thumbnailRetryDelay,
  withThumbnailRetry,
} from "../../courses/thumbnailRetry";

/**
 * An enrolled course's thumbnail, filling the box it is put in, over a
 * shimmer of the card's own surface until it has loaded. A request that
 * fails is tried again (the CDN answers some with 504); a stored address
 * that keeps failing falls back to the one built from the thumbnail's media
 * id. When nothing loads, the card's surface shows, never a broken-image
 * frame.
 */
export function LearnerCourseThumbnail({
  course,
  priority = false,
}: {
  course: Pick<EnrolledCourse, "courseThumbnailUrl" | "courseThumbnailMediaId">;
  /** One of the first pictures the page paints. */
  priority?: boolean;
}) {
  const sources = [
    course.courseThumbnailUrl?.trim(),
    getCourseThumbnailCdnUrl(course.courseThumbnailMediaId),
  ].filter(
    (source, index, all): source is string =>
      Boolean(source) && all.indexOf(source) === index,
  );
  const sourcesKey = sources.join("\n");
  // Every try in order: each source, then its retries.
  const [tries, setTries] = useState({ key: sourcesKey, count: 0 });
  const tryCount = tries.key === sourcesKey ? tries.count : 0;
  const source = sources[Math.floor(tryCount / (THUMBNAIL_RETRIES + 1))];
  const attempt = tryCount % (THUMBNAIL_RETRIES + 1);
  const [loaded, setLoaded] = useState(false);
  const [erroring, setErroring] = useState(false);
  // Shown in this tab before: the browser has it, so it is asked for at once.
  const shownBefore = useCourseThumbnailShownBefore(sources[0] ?? "");
  const retryTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);
  // A picture the browser already holds is complete as soon as it is put
  // up, before its load event: read before the first paint, so its shimmer
  // is never drawn (the home redrawn over a copy of itself on a reload).
  const imageRef = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, [source, tryCount]);

  const handleError = () => {
    setErroring(true);
    window.clearTimeout(retryTimerRef.current);
    // A retry waits; moving on to the next source does not.
    const delay =
      attempt < THUMBNAIL_RETRIES ? thumbnailRetryDelay(attempt) : 0;
    retryTimerRef.current = window.setTimeout(() => {
      setErroring(false);
      setTries({ key: sourcesKey, count: tryCount + 1 });
    }, delay);
  };

  return (
    <span className="relative block size-full">
      {loaded || !source ? null : (
        <span
          className={`absolute inset-0 ${courseCardShimmerClass}`}
          aria-hidden="true"
        />
      )}
      {source ? null : (
        <span
          className="absolute inset-0 bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
          aria-hidden="true"
        />
      )}
      {source ? (
        <img
          // A retry is a new element: one that failed keeps its broken state.
          key={tryCount}
          ref={imageRef}
          src={withThumbnailRetry(source, attempt)}
          alt=""
          width={960}
          height={540}
          loading={priority || shownBefore ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "low"}
          decoding="async"
          onLoad={() => {
            setLoaded(true);
            if (sources[0]) rememberShownCourseThumbnail(sources[0]);
          }}
          onError={handleError}
          className={`absolute inset-0 size-full object-cover ${erroring ? "invisible" : ""}`}
        />
      ) : null}
    </span>
  );
}
