import type { LessonPlayerMinimizeGestureState } from "../player";
import { SPLIT_FRAME_SNAP_WIDTH } from "../../components/splitFrame";
import { LESSON_DRAWER_MIN_FLOATING_WIDTH } from "../useLessonDrawerHeroControl";

export const CURRICULUM_SNAP_WIDTH = SPLIT_FRAME_SNAP_WIDTH;
export const FLOATING_LESSON_DRAWER_SNAP_WIDTH =
  LESSON_DRAWER_MIN_FLOATING_WIDTH / 2;
export const LESSON_DRAWER_FALLBACK_SNAP_POINT = 0.72;
export const CURRICULUM_SWIPE_ACTIVATION_DISTANCE = 12;
export const CURRICULUM_SWIPE_DIRECTION_RATIO = 1.2;
export const CURRICULUM_SWIPE_COMMIT_DISTANCE = 72;
export const CURRICULUM_SWIPE_FLING_DISTANCE = 24;
export const CURRICULUM_SWIPE_FLING_VELOCITY = 0.3;
export const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;
export const COURSE_CONTENT_DRAWER_QUERY = "(max-width: 1080px)";
export const PHONE_LESSON_DRAWER_QUERY = "(max-width: 640px)";
export const FLOATING_LESSON_DRAWER_WIDTH_KEY =
  "veolms-floating-curriculum-width";
export const IDLE_PLAYER_MINIMIZE_GESTURE: LessonPlayerMinimizeGestureState = {
  offsetY: 0,
  phase: "idle",
  progress: 0,
};

export const CURRICULUM_SWIPE_EXCLUSION_SELECTOR = [
  ".learning-curriculum__resize-rail",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="slider"]',
  "[data-player-control]",
  "[data-player-menu]",
  "[data-sidebar-swipe-ignore]",
  "[data-learning-swipe-ignore]",
].join(",");

export const LESSON_DRAWER_REVEAL_EXCLUSION_SELECTOR = [
  ".learning-curriculum__resize-rail",
  ".elastic-scroller",
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="slider"]',
  "[data-player-control]",
  "[data-player-menu]",
].join(",");

/**
 * How long the pointer rests in a drag of the course content before React is
 * told the width the drag has reached (see moveCurriculumResize).
 */
export const CURRICULUM_RESIZE_STATE_SYNC_MS = 140;
