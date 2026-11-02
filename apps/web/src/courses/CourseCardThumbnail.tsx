import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Course } from "./catalogue";
import { courseCardShimmerClass } from "./courseCardShimmer";
import { courseThumbnailSizes } from "./courseThumbnail";
import {
  THUMBNAIL_RETRIES,
  thumbnailRetryDelay,
  withThumbnailRetry,
} from "./thumbnailRetry";
import {
  COURSE_THUMBNAIL_ALT_ATTRIBUTE,
  COURSE_THUMBNAIL_SRC_ATTRIBUTE,
  COURSE_THUMBNAIL_SRCSET_ATTRIBUTE,
  getShownCourseThumbnailsScript,
  rememberShownCourseThumbnail,
  useCourseThumbnailShownBefore,
} from "./courseThumbnailMemory";

interface CourseCardThumbnailProps {
  course: Course;
  priority: boolean;
}

/**
 * The card's image, over a shimmer of the card's own surface until it has
 * loaded.
 */
export function CourseCardThumbnail({
  course,
  priority,
}: CourseCardThumbnailProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const shownBefore = useCourseThumbnailShownBefore(course.thumbnail);
  const [isNearViewport, setIsNearViewport] = useState(priority);
  const [loaded, setLoaded] = useState(false);
  // Which try this is, and whether every try failed: the image is then
  // left out and the card's surface shows, never a broken-image frame.
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [erroring, setErroring] = useState(false);
  const requested = priority || isNearViewport || shownBefore;
  const srcSet = course.thumbnailSrcSet
    ?.map(
      (variant) =>
        `${withThumbnailRetry(variant.url, attempt)} ${variant.width}w`,
    )
    .join(", ");
  const retryTimerRef = useRef<number | undefined>(undefined);

  const handleError = () => {
    setErroring(true);
    if (attempt >= THUMBNAIL_RETRIES) {
      setFailed(true);
      return;
    }
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => {
      setErroring(false);
      setAttempt(attempt + 1);
    }, thumbnailRetryDelay(attempt));
  };
  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

  const handleLoad = (image: HTMLImageElement) => {
    // The inline script hides an image that failed before hydration; the
    // same element can still load afterwards.
    image.style.removeProperty("visibility");
    setLoaded(true);
    rememberShownCourseThumbnail(course.thumbnail);
  };

  useEffect(() => {
    if (requested) return;

    const image = imageRef.current;
    if (!image) return;

    // Native lazy-load distance varies by browser and connection speed. Some
    // mobile runs request several screens of thumbnails at once, competing
    // with the visible course image and render-critical assets.
    if (typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setIsNearViewport(true);
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(image);

    return () => observer.disconnect();
  }, [requested]);

  // An image that finished before the page hydrated (the first ones, or
  // one the inline script gave its source) fired its load or error event
  // unseen. One the browser already holds is complete as soon as it is put
  // up: read before the first paint, so its shimmer is never drawn.
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!requested || !image?.complete || !image.getAttribute("src")) return;
    if (image.naturalWidth > 0) {
      handleLoad(image);
    } else {
      handleError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checked once per request; handleError reads the attempt it belongs to
  }, [course.thumbnail, requested]);

  return (
    <>
      {/* Gone once the image is in: a pulsing layer under it would stay a
          compositor layer for nothing. */}
      {loaded || failed ? null : (
        <div
          className={`absolute inset-0 ${courseCardShimmerClass}`}
          aria-hidden="true"
          data-course-card-thumbnail-shimmer
        />
      )}
      {/* A waiting image has no source yet, only the attributes the inline
          script reads (see courseThumbnailMemory), and stays hidden: Chrome
          draws a broken-image frame for an image without one. */}
      {failed ? null : (
        <img
          // A retry is a new element: one that failed keeps its broken state.
          key={attempt}
          ref={imageRef}
          src={
            requested
              ? withThumbnailRetry(course.thumbnail, attempt)
              : undefined
          }
          srcSet={requested ? srcSet : undefined}
          sizes={courseThumbnailSizes}
          alt={requested ? course.title : ""}
          {...(requested
            ? null
            : {
                [COURSE_THUMBNAIL_SRC_ATTRIBUTE]: course.thumbnail,
                [COURSE_THUMBNAIL_SRCSET_ATTRIBUTE]: srcSet,
                [COURSE_THUMBNAIL_ALT_ATTRIBUTE]: course.title,
              })}
          className={`absolute inset-0 h-full w-full object-cover [&:not([src])]:invisible ${erroring ? "invisible" : ""}`}
          width={960}
          height={540}
          // One shown before comes from the browser's cache, and a lazy one
          // given its source before hydration never started loading.
          loading={priority || shownBefore ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "low"}
          decoding="async"
          onLoad={(event) => handleLoad(event.currentTarget)}
          onError={handleError}
        />
      )}
    </>
  );
}

/**
 * Placed once after a list of course cards: on a reload, the images this
 * tab showed before appear before the page hydrates (see
 * courseThumbnailMemory).
 */
export function ShownCourseThumbnailsScript() {
  return (
    <script
      // Runs only from the prerendered HTML: React does not run a script it
      // inserts itself, and by then the cards handle it.
      dangerouslySetInnerHTML={{ __html: getShownCourseThumbnailsScript() }}
    />
  );
}
