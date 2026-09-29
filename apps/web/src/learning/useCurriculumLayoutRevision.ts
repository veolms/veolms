import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

export function useCurriculumLayoutRevision(
  lessonListRef: RefObject<HTMLElement | null>,
) {
  const [revision, setRevision] = useState(0);

  useLayoutEffect(() => {
    const lessonList = lessonListRef.current;
    if (!lessonList || typeof ResizeObserver === "undefined") return undefined;

    let scheduledFrame: number | null = null;
    const scheduleRevision = () => {
      if (scheduledFrame !== null) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = null;
        setRevision((current) => current + 1);
      });
    };
    const observer = new ResizeObserver(scheduleRevision);
    observer.observe(lessonList);
    window.addEventListener("resize", scheduleRevision);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleRevision);
      if (scheduledFrame !== null) {
        window.cancelAnimationFrame(scheduledFrame);
      }
    };
  }, [lessonListRef]);

  return revision;
}
