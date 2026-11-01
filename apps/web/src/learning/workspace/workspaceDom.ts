import {
  LESSON_DRAWER_DEFAULT_FLOATING_WIDTH,
  LESSON_DRAWER_MAX_FLOATING_WIDTH,
  LESSON_DRAWER_MIN_FLOATING_WIDTH,
} from "../useLessonDrawerHeroControl";
import {
  FLOATING_LESSON_DRAWER_WIDTH_KEY,
  CURRICULUM_SWIPE_EXCLUSION_SELECTOR,
} from "./workspaceConstants";

export const safeResumeVideo = (video: HTMLVideoElement | null) => {
  if (!video || !video.paused) return;
  try {
    const playResult = video.play?.();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => undefined);
    }
  } catch {
    // Ignore environments where play() is unsupported (e.g. JSDOM) or rejected by browser policies
  }
};

export const isCurriculumSwipeExcludedTarget = (
  target: EventTarget | null,
  selector = CURRICULUM_SWIPE_EXCLUSION_SELECTOR,
) => target instanceof Element && Boolean(target.closest(selector));

export const getInitialFloatingLessonDrawerWidth = () => {
  if (typeof window === "undefined")
    return LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;

  try {
    const storedWidth = window.localStorage.getItem(
      FLOATING_LESSON_DRAWER_WIDTH_KEY,
    );
    if (storedWidth === null) return LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;

    const savedWidth = Number(storedWidth);
    return Number.isFinite(savedWidth)
      ? Math.min(
          LESSON_DRAWER_MAX_FLOATING_WIDTH,
          Math.max(LESSON_DRAWER_MIN_FLOATING_WIDTH, savedWidth),
        )
      : LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;
  } catch {
    return LESSON_DRAWER_DEFAULT_FLOATING_WIDTH;
  }
};
