import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { readyLessonToOpen } from "../../learning/lessonOpenIntent";

/**
 * Gets the lesson the home page leads with ready before the learner presses
 * Enter, so it opens as if they had never left it: once the page is idle,
 * everything `readyLessonToOpen` fetches (the course's curriculum and access
 * answer, the learner's progress, the player's code, and the lesson's video
 * from where the learner left off), as every other way into a lesson does
 * on a hover (see learning/lessonOpenIntent). The lesson page's code and
 * stylesheets are fetched by `<PrefetchPageLinks>` beside the hero (see
 * LearnerHome).
 *
 * Skipped on a connection that asks to save data (preloadLessonPlayback
 * fetches only the small start-up answer then). Nothing is cancelled when
 * the learner goes elsewhere: the video preload is the page's one
 * speculative preload, which the next one (a hovered lesson) replaces.
 */
export function useHeroLessonWarmUp(
  lesson: { courseSlug: string; lessonNumber: number } | null,
) {
  const queryClient = useQueryClient();
  const courseSlug = lesson?.courseSlug;
  const lessonNumber = lesson?.lessonNumber;

  useEffect(() => {
    if (!courseSlug || !lessonNumber) return undefined;
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      readyLessonToOpen(queryClient, courseSlug, lessonNumber);
    };
    // After what the home page itself needs: its own requests come first.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 1500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = window.setTimeout(warm, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [courseSlug, lessonNumber, queryClient]);
}
