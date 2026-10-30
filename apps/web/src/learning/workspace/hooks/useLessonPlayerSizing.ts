import {
  useEffect,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  LESSON_PLAYER_SEEK_TIME_ONLY_HEIGHT,
  LESSON_PLAYER_SHORT_HEIGHT,
  useLessonHiddenVideoPullDown,
  useLessonPlayerHeight,
  useLessonTitleHeightSwipe,
} from "../../player/LessonPlayerHeightHandle";
import { getLessonReading } from "../../lessonWithoutVideo";
import {
  isPhoneLayoutHeld,
  onPhoneLayoutRelease,
} from "../../../shell/phoneVideoFullscreenHold";
import type { CourseLesson } from "@veolms/contracts";

export interface UseLessonPlayerSizingArgs {
  theaterMode: boolean;
  playerWrapRef: RefObject<HTMLDivElement | null>;
  showingQuiz: boolean;
  stageLesson: CourseLesson | undefined;
}

export interface UseLessonPlayerSizingResult {
  stickyPlayer: boolean;
  playerHeight: number | null;
  setPlayerHeight: (next: number | null) => void;
  appliedPlayerHeight: number | null;
  readingGrowable:
    | {
        growth: number | null;
        onGrowthChange: Dispatch<SetStateAction<number | null>>;
      }
    | undefined;
  appliedReadingGrowth: number | null;
  shortPlayer: boolean;
  seekTimeOnly: boolean;
  onHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onHeaderPointerLeave: () => void;
  titleSwipeHandlers: Omit<
    ReturnType<typeof useLessonTitleHeightSwipe>,
    "onHeaderPointerMove" | "onHeaderPointerLeave"
  >;
}

export function useLessonPlayerSizing({
  theaterMode,
  playerWrapRef,
  showingQuiz,
  stageLesson,
}: UseLessonPlayerSizingArgs): UseLessonPlayerSizingResult {
  // The video is not kept in view for a quiz (there is none) or in theater
  // mode (it already fills the page).
  const stickyPlayer = !showingQuiz && !theaterMode;
  // The viewer can drag the video area shorter to see more of the page.
  const [playerHeight, setPlayerHeight] = useLessonPlayerHeight();
  const appliedPlayerHeight = theaterMode ? null : playerHeight;
  // A reading can also be pulled taller than a video's 16:9 (the title, or
  // the grip). Taller, it scrolls away with the page as a video at its full
  // height does; only a shortened one stays at the top.
  const [readingGrowth, setReadingGrowth] = useState<number | null>(null);
  const lessonIsReading = getLessonReading(stageLesson ?? null) !== null;
  const readingGrowable =
    lessonIsReading && stickyPlayer
      ? { growth: readingGrowth, onGrowthChange: setReadingGrowth }
      : undefined;
  const appliedReadingGrowth =
    readingGrowable && appliedPlayerHeight === null ? readingGrowth : null;
  const shortPlayer =
    appliedPlayerHeight !== null &&
    appliedPlayerHeight <= LESSON_PLAYER_SHORT_HEIGHT;
  const seekTimeOnly =
    appliedPlayerHeight !== null &&
    appliedPlayerHeight <= LESSON_PLAYER_SEEK_TIME_ONLY_HEIGHT;
  // Touch: a shortened or hidden video is pulled back out from the page
  // under it.
  useLessonHiddenVideoPullDown(
    stickyPlayer ? appliedPlayerHeight : null,
    setPlayerHeight,
  );
  // Touch: swiping the lesson title up or down resizes the video too.
  const { onHeaderPointerMove, onHeaderPointerLeave, ...titleSwipeHandlers } =
    useLessonTitleHeightSwipe(playerHeight, setPlayerHeight, readingGrowable);
  // Where the page's elastic scroller sits. With the video showing, it goes
  // a little below the middle of the space left under the video. With the
  // video put away, it sits where the course content's own scroller does.
  //
  // The video's height changes on every frame of a resize (of the video, the
  // course content or the sidebar). A variable set on the page is inherited
  // by everything in it, so setting it there restyles the whole page; done
  // each frame, that halved the frame rate of those resizes. So while the
  // height is changing the scroller alone is told, and the page hears once
  // it has settled, for a scroller that is only mounted later.
  useEffect(() => {
    const playerWrap = playerWrapRef.current;
    const main = playerWrap?.closest<HTMLElement>(".courses-main");
    if (!playerWrap || !main) return undefined;
    const property = "--learning-elastic-scroller-clearance";
    const findScroller = () =>
      main.querySelector<HTMLElement>(":scope > .elastic-scroller");
    let settleTimer: number | undefined;
    let clearance = "";
    const tellPage = () => {
      window.clearTimeout(settleTimer);
      if (main.style.getPropertyValue(property) !== clearance) {
        main.style.setProperty(property, clearance);
      }
    };
    const place = () => {
      // Not while a phone plays the video full screen sideways: the page
      // behind is not laid out then, and measuring it forced a style and
      // layout pass on every step of the turn (see phoneVideoFullscreenHold).
      if (isPhoneLayoutHeld()) return;
      const videoHeight = playerWrap.getBoundingClientRect().height;
      clearance = `${Math.round(
        videoHeight <= 0
          ? 268
          : Math.max(96, (main.clientHeight - videoHeight) * 0.45),
      )}px`;
      findScroller()?.style.setProperty(property, clearance);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(tellPage, 160);
    };
    const sizes = new ResizeObserver(place);
    sizes.observe(playerWrap);
    sizes.observe(main);
    const stopCatchingUp = onPhoneLayoutRelease(place);
    // The page hears with the first settle, not at once: on a lesson just
    // opened that restyled all of it in the middle of drawing the video.
    place();
    return () => {
      sizes.disconnect();
      stopCatchingUp();
      window.clearTimeout(settleTimer);
      findScroller()?.style.removeProperty(property);
      main.style.removeProperty(property);
    };
  }, [playerWrapRef]);

  // Alt+V: a video at full height is put away at the top; one that is
  // shortened or put away goes back to full height (like double-clicking
  // the resize grip).
  useEffect(() => {
    if (!stickyPlayer) return undefined;
    const handleToggleVideoShortcut = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyV" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])",
        )
      ) {
        return;
      }
      event.preventDefault();
      setPlayerHeight(playerHeight === null ? 0 : null);
      setReadingGrowth(null);
    };
    window.addEventListener("keydown", handleToggleVideoShortcut);
    return () =>
      window.removeEventListener("keydown", handleToggleVideoShortcut);
  }, [playerHeight, setPlayerHeight, stickyPlayer]);
  // Putting the video away at the top also stops it: nothing would show
  // that it is still running. It plays again from the keyboard shortcut,
  // or once it is dragged back into view and played there.
  useEffect(() => {
    if (appliedPlayerHeight !== 0) return;
    const video = document.querySelector<HTMLVideoElement>(
      ".learning-persistent-player--full video",
    );
    if (video && !video.paused) video.pause();
  }, [appliedPlayerHeight]);
  return {
    stickyPlayer,
    playerHeight,
    setPlayerHeight,
    appliedPlayerHeight,
    readingGrowable,
    appliedReadingGrowth,
    shortPlayer,
    seekTimeOnly,
    onHeaderPointerMove,
    onHeaderPointerLeave,
    titleSwipeHandlers,
  };
}
