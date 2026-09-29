import { useEffect, useRef, useState } from "react";
import { CourseThumbnailPlaceholder } from "./CourseThumbnailPlaceholder";
import type { Course } from "./catalogue";
import {
  courseThumbnailSizes,
  getCourseThumbnailSrcSet,
} from "./courseThumbnail";

interface CourseCardThumbnailProps {
  course: Course;
  priority: boolean;
}

export function CourseCardThumbnail({
  course,
  priority,
}: CourseCardThumbnailProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(priority);

  useEffect(() => {
    if (priority || isNearViewport) return;

    const placeholder = placeholderRef.current;
    if (!placeholder) return;

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
    observer.observe(placeholder);

    return () => observer.disconnect();
  }, [isNearViewport, priority]);

  if (!priority && !isNearViewport) {
    return (
      <div ref={placeholderRef} className="absolute inset-0" aria-hidden="true">
        <CourseThumbnailPlaceholder />
      </div>
    );
  }

  return (
    <img
      src={course.thumbnail}
      srcSet={getCourseThumbnailSrcSet(course)}
      sizes={courseThumbnailSizes}
      alt={course.title}
      className="h-full w-full object-cover"
      width={960}
      height={540}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
    />
  );
}
