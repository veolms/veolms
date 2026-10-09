import {
  FullscreenButton,
  MuteButton,
  PlayerIconButton,
  PlayerMenuItem,
  PlayButton,
  SettingsMenu,
  TimeDisplay,
  Timeline,
  VolumeControl,
  ZoomLevelIndicator,
  getPlayerThemeStyle,
  useChapters,
  usePlayerMobileInteraction,
  usePlayerState,
  usePlayerTheme,
} from "@veolms/video-player";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { QueueIcon as Queue } from "@phosphor-icons/react/Queue";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  LEARNING_PLAYER_MINIMIZE_LABEL,
  LEARNING_PLAYER_MINIMIZE_SHORTCUT,
  LEARNING_PLAYER_MINIMIZE_TITLE,
} from "./learningPlayerShortcuts";
import { cn } from "../../lib/utils";
import { getPhoneLessonDrawerCollapsedSnapPoint } from "../useLessonDrawerHeroControl";
import {
  LessonChaptersSheetMenu,
  LessonChaptersToggleButton,
} from "./chapters/LessonChaptersControl";
import { LessonChaptersPanel } from "./chapters/LessonChaptersPanel";

const PLAYER_SURFACE_CLASS =
  "bg-(--video-player-control-surface) text-(--video-player-control-text) shadow-(--video-player-control-shadow)";
const PLAYER_INNER_CONTROL_CLASS =
  "!rounded-full !bg-transparent transition-colors duration-150 ease-out hover:!bg-(--video-player-control-surface-hover) active:!bg-(--video-player-control-surface-active) focus-visible:!bg-(--video-player-control-surface-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)";
const PLAYER_ICON_PILL_CLASS =
  "!h-8 !w-auto !rounded-full !bg-transparent !px-2 !shadow-none drop-shadow-none transition-colors duration-150 ease-out hover:!bg-transparent active:!bg-(--video-player-control-surface-active) focus-visible:!bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) sm:!h-9 sm:!bg-transparent sm:!px-3 sm:hover:!bg-(--video-player-control-surface-hover) sm:active:!bg-(--video-player-control-surface-active) sm:focus-visible:!bg-(--video-player-control-surface-hover)";
const MOBILE_INVISIBLE_HIT_SURFACE_CLASS =
  "[&&&]:!bg-transparent [&&&:hover]:!bg-transparent [&&&:active]:!bg-transparent [&&&:focus-visible]:!bg-transparent [&&&[aria-pressed=true]]:!bg-transparent";
const LANDSCAPE_ORIENTATION_QUERY = "(orientation: landscape)";

const subscribeToLandscapeOrientation = (onStoreChange: () => void) => {
  const media = window.matchMedia(LANDSCAPE_ORIENTATION_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

const getLandscapeOrientationSnapshot = () =>
  window.matchMedia(LANDSCAPE_ORIENTATION_QUERY).matches;

const getLandscapeOrientationServerSnapshot = () => false;

// Matches Tailwind's `sm` breakpoint. Settings and autoplay are rendered in
// exactly one place, so their desktop position is decided in JS, not CSS.
const WIDE_VIEWPORT_QUERY = "(min-width: 40rem)";

const subscribeToWideViewport = (onStoreChange: () => void) => {
  const media = window.matchMedia(WIDE_VIEWPORT_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
};

const getWideViewportSnapshot = () =>
  window.matchMedia(WIDE_VIEWPORT_QUERY).matches;

const getWideViewportServerSnapshot = () => false;

/**
 * Keeps a control layer hidden while the expand (maximize) motion is still
 * carrying the player to its resting place. The motion marks the full host
 * with this phase for exactly that stretch; once it clears, the layer's own
 * `transition-opacity` fades the controls in over the landed video.
 */
const EXPAND_MOTION_HIDDEN_CLASS =
  "[[data-learning-player-restore-phase=expanding]_&]:!invisible [[data-learning-player-restore-phase=expanding]_&]:!opacity-0 [[data-learning-player-restore-phase=expanding]_&]:!transition-none [[data-learning-player-restore-phase=expanding]_&_*]:!pointer-events-none";
const MOBILE_TEXT_PILL_HIT_CLASS = `${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} isolate !rounded-full !bg-transparent transition-colors duration-150 ease-out before:pointer-events-none before:absolute before:z-0 before:rounded-full before:bg-(--video-player-control-surface) before:shadow-(--video-player-control-shadow) before:transition-colors before:duration-150 before:ease-out before:content-[''] hover:!bg-transparent hover:before:bg-(--video-player-control-surface-hover) active:!bg-transparent active:before:bg-(--video-player-control-surface-active) focus-visible:!bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)`;

/**
 * The round fullscreen button. On a phone it is a 32px circle inside a 44px
 * touch target. `desktop` makes it a 42px circle with a 23px icon, the size
 * of the play and volume pills it shares the bottom row with.
 */
function CircularFullscreenButton({ desktop = false }: { desktop?: boolean }) {
  return (
    <div
      className={`inline-flex items-center justify-center ${desktop ? "size-10.5" : "size-11"}`}
      data-player-control-hit-area="fullscreen"
    >
      <FullscreenButton
        className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} group/fullscreen ${desktop ? "!size-10.5" : "!size-11"} !rounded-full !bg-transparent !p-0 !shadow-none drop-shadow-none hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent`}
        iconContainerClassName={`pointer-events-none relative z-10 grid ${desktop ? "size-10.5" : "size-8"} place-items-center rounded-full bg-(--video-player-control-surface) shadow-(--video-player-control-shadow) transition-colors duration-150 ease-out group-hover/fullscreen:bg-(--video-player-control-surface-hover) group-active/fullscreen:bg-(--video-player-control-surface-active) group-focus-visible/fullscreen:bg-(--video-player-control-surface-hover)`}
        iconSize={desktop ? 23 : 20}
      />
    </div>
  );
}

function getPlayerIconPillClass(
  mobileInteraction: boolean,
  circular = false,
): string {
  const controlClass = circular
    ? PLAYER_ICON_PILL_CLASS.replace("!h-8", "!h-9")
        .replace("!w-auto", "!w-9")
        .replace("!px-2", "!px-0")
        .replace("sm:!px-3", "sm:!px-0")
    : PLAYER_ICON_PILL_CLASS;

  return `${controlClass} ${
    mobileInteraction
      ? `${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} sm:!h-8 sm:!bg-transparent ${circular ? "sm:!px-0" : "sm:!px-2"} sm:hover:!bg-transparent sm:focus-visible:!bg-transparent`
      : ""
  }`;
}

/**
 * How the desktop control row sheds controls as the player narrows.
 * 0: everything in the bottom row. 1: autoplay and settings have moved to
 * the top right corner. 2: the Lessons button has joined them there.
 * 3: the previous and next lesson buttons are hidden as well, because even
 * then the time would run into the fullscreen button.
 */
type DesktopEndControlsStage = 0 | 1 | 2 | 3;

/** The space kept between neighbouring pills in the row (gap-2). */
const DESKTOP_CONTROL_GAP = 8;
/** The row's insets: 12px before the first pill, 8px after the last. */
const DESKTOP_CONTROL_ROW_INSET = 20;
/** The volume pill at rest; hovering widens it over the time, not the row. */
const DESKTOP_VOLUME_REST_WIDTH = 42;
/** The round fullscreen button that stays below once the pill has moved. */
const DESKTOP_FULLSCREEN_BUTTON_WIDTH = 44;

/** A round, icon-only pill (the Chapters and Lessons buttons, shrunk). */
const DESKTOP_ICON_PILL_WIDTH = 38;

/**
 * The width of the Lessons pill with its label, remembered for while it
 * shows only its icon: every decision is made from full widths, or a pill
 * that shrank would seem to fit again and grow straight back.
 */
function readLessonsFullWidth(
  lessons: HTMLElement | null,
  lessonsFullWidth: { current: number },
): number {
  if (!lessons) return 0;
  if (!lessons.querySelector('[data-compact="true"]')) {
    lessonsFullWidth.current = lessons.offsetWidth;
  }
  return lessonsFullWidth.current || lessons.offsetWidth;
}

/**
 * Picks the stage from the natural widths of the pills, wherever they
 * currently sit: a control moves up at the width where the Lessons button
 * would otherwise come closer to the time than pills are to one another.
 */
function measureDesktopEndControlsStage(
  host: HTMLElement,
  frame: HTMLElement,
  actionsWithFullscreenWidth: { current: number },
  lessonNavigationWidth: { current: number },
  lessonsFullWidth: { current: number },
): DesktopEndControlsStage {
  const start = host.querySelector<HTMLElement>(
    "[data-player-desktop-start-controls]",
  );
  const lessons = host.querySelector<HTMLElement>(
    "[data-player-desktop-lessons]",
  );
  const actions = host.querySelector<HTMLElement>(
    '[data-player-control-cluster="player-actions"]',
  );
  if (!start || start.offsetWidth === 0) return 0;

  const pills = Array.from(start.children) as HTMLElement[];
  const startWidth = pills.reduce((total, pill, index) => {
    const width = pill.querySelector(".player-volume-slider")
      ? Math.min(pill.offsetWidth, DESKTOP_VOLUME_REST_WIDTH)
      : pill.offsetWidth;
    return total + width + (index > 0 ? DESKTOP_CONTROL_GAP : 0);
  }, 0);
  // The previous/next pill counts at its width even while it is hidden, or
  // hiding it would make room for itself and bring it straight back.
  const lessonNavigation = start.querySelector<HTMLElement>(
    '[data-player-control-cluster="lesson-navigation"]',
  );
  if (lessonNavigation) {
    lessonNavigationWidth.current =
      lessonNavigation.offsetWidth + DESKTOP_CONTROL_GAP;
  }
  const fullStartWidth =
    startWidth + (lessonNavigation ? 0 : lessonNavigationWidth.current);
  const lessonsWidth = lessons
    ? readLessonsFullWidth(lessons, lessonsFullWidth) + DESKTOP_CONTROL_GAP
    : 0;
  // The pill holds the fullscreen button only while it is in the bottom
  // row, so its width there is remembered for when it is not.
  const actionsHoldFullscreen = Boolean(
    actions?.closest("[data-player-desktop-end-controls]"),
  );
  if (actions && actionsHoldFullscreen) {
    actionsWithFullscreenWidth.current = actions.offsetWidth;
  }
  const actionsWidth = actions
    ? (actionsWithFullscreenWidth.current ||
        actions.offsetWidth + DESKTOP_FULLSCREEN_BUTTON_WIDTH) +
      DESKTOP_CONTROL_GAP
    : 0;
  const available = frame.clientWidth - DESKTOP_CONTROL_ROW_INSET;
  // The gap that has to remain between the time and whatever follows it.
  const base = fullStartWidth + DESKTOP_CONTROL_GAP;

  if (base + lessonsWidth - DESKTOP_CONTROL_GAP + actionsWidth <= available) {
    return 0;
  }
  if (base + lessonsWidth + DESKTOP_FULLSCREEN_BUTTON_WIDTH <= available) {
    return 1;
  }
  if (base + DESKTOP_FULLSCREEN_BUTTON_WIDTH <= available) return 2;
  return lessonNavigationWidth.current > 0 ? 3 : 2;
}

/**
 * A player shorter than this cannot show the settings popover whole: it
 * holds four two-line rows (about 244px) and opens some 60px in from the
 * player's top or bottom edge, so a shorter player cuts it to three rows or
 * fewer. Below this height the settings open as a bottom sheet instead, as
 * they do on a phone.
 */
const DESKTOP_SETTINGS_POPOVER_MIN_PLAYER_HEIGHT = 312;

/**
 * Where the settings sheet goes when a short player forces it on a wide
 * screen: across the column the video is in, edge to edge, resting on the
 * bottom edge of the rounded content frame and rounded like it there. It
 * does not go on down to the edge of the window.
 */
interface DesktopSettingsSheetPlacement {
  bottom: number;
  bottomRadius: string;
  left: number;
  width: number;
}

function measureDesktopSettingsSheetPlacement(
  host: HTMLElement,
): DesktopSettingsSheetPlacement {
  const column = host.getBoundingClientRect();
  const frame = host.closest<HTMLElement>(".courses-main-frame");
  // How far the frame's bottom edge is above the bottom of the box a fixed
  // element is placed in. That box is measured with a fixed element of its
  // own rather than taken from the window's height: on a tablet the two
  // differ (the browser's toolbar), which left a gap under the sheet.
  let bottom = 0;
  if (frame) {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    bottom = Math.max(
      0,
      Math.round(
        probe.getBoundingClientRect().bottom -
          frame.getBoundingClientRect().bottom,
      ),
    );
    probe.remove();
  }
  return {
    bottom,
    // The sheet takes the frame's own corners where the two meet.
    bottomRadius: frame
      ? getComputedStyle(frame).borderBottomLeftRadius
      : "0px",
    left: Math.round(column.left),
    width: Math.round(column.width),
  };
}

/** How much wider the volume pill is with its slider out (126px for 42px). */
const DESKTOP_VOLUME_OPEN_GROWTH = 84;

/**
 * Whether the volume slider, when it opens, pushes the time into the
 * Lessons button beside it in the bottom row. The row is laid out for the
 * volume pill at rest, so a row with little room to spare has none for the
 * slider. Where this is true the Lessons button fades out for as long as
 * the slider is out.
 */
function measureVolumeCrowdsLessons(host: HTMLElement): boolean {
  const start = host.querySelector<HTMLElement>(
    "[data-player-desktop-start-controls]",
  );
  const lessons = host.querySelector<HTMLElement>(
    "[data-player-desktop-end-controls] [data-player-desktop-lessons]",
  );
  if (!start || !lessons || start.offsetWidth === 0) return false;

  // Where the row's first group ends with the volume pill at rest, whatever
  // state the pill happens to be in while this is measured.
  const pills = Array.from(start.children) as HTMLElement[];
  const restWidth = pills.reduce((total, pill, index) => {
    const width = pill.querySelector(".player-volume-slider")
      ? Math.min(pill.offsetWidth, DESKTOP_VOLUME_REST_WIDTH)
      : pill.offsetWidth;
    return total + width + (index > 0 ? DESKTOP_CONTROL_GAP : 0);
  }, 0);
  const restEnd = start.getBoundingClientRect().left + restWidth;
  return (
    lessons.getBoundingClientRect().left -
      (restEnd + DESKTOP_VOLUME_OPEN_GROWTH) <
    DESKTOP_CONTROL_GAP
  );
}

/** The minimize button in the top left corner, and the gap after it. */
const DESKTOP_TOP_ROW_START_RESERVE = 52;
/** The top row's inset from the right edge. */
const DESKTOP_TOP_ROW_END_INSET = 8;

/**
 * How far the pills in the top right corner have to shrink to stay clear of
 * the minimize button in the top left one. 0: not at all. 1: Chapters shows
 * only its icon. 2: so does Lessons, the very last thing to give way.
 */
type DesktopTopRowCompactLevel = 0 | 1 | 2;

function measureDesktopTopRowCompactLevel(
  host: HTMLElement,
  frame: HTMLElement,
  stage: DesktopEndControlsStage,
  chaptersFullWidth: { current: number },
  lessonsFullWidth: { current: number },
): DesktopTopRowCompactLevel {
  const chapters = host.querySelector<HTMLElement>(
    '[data-player-control-frame] [data-player-control-hit-area="chapters"]',
  );
  // Its full width is remembered for while it is showing only the icon.
  if (chapters && chapters.dataset.compact !== "true") {
    chaptersFullWidth.current = chapters.offsetWidth;
  }
  const lessons = host.querySelector<HTMLElement>(
    "[data-player-desktop-lessons]",
  );
  const actions = host.querySelector<HTMLElement>(
    '[data-player-control-cluster="player-actions"]',
  );
  // In the bottom row the pill also holds the fullscreen button, which it
  // leaves behind when it moves up.
  const actionsWidth = actions
    ? actions.offsetWidth -
      (actions.closest("[data-player-desktop-end-controls]")
        ? DESKTOP_FULLSCREEN_BUTTON_WIDTH
        : 0)
    : 0;
  const available =
    frame.clientWidth -
    DESKTOP_TOP_ROW_START_RESERVE -
    DESKTOP_TOP_ROW_END_INSET;
  const lessonsAtTop = stage >= 2 && lessons !== null;
  const actionsSpace =
    stage >= 1 && actions ? actionsWidth + DESKTOP_CONTROL_GAP : 0;
  const lessonsSpace = lessonsAtTop
    ? readLessonsFullWidth(lessons, lessonsFullWidth) + DESKTOP_CONTROL_GAP
    : 0;
  const chaptersSpace = chapters ? chaptersFullWidth.current : 0;
  const compactChaptersSpace = chapters ? DESKTOP_ICON_PILL_WIDTH : 0;

  if (chaptersSpace + lessonsSpace + actionsSpace <= available) return 0;
  if (
    !lessonsAtTop ||
    compactChaptersSpace + lessonsSpace + actionsSpace <= available
  ) {
    return chapters ? 1 : 0;
  }
  return 2;
}

function PlayerControlSurface({
  blurred = false,
  children,
  className,
  cluster,
}: {
  blurred?: boolean;
  children: ReactNode;
  className: string;
  cluster?: string;
}) {
  return (
    <div
      className={`${PLAYER_SURFACE_CLASS} box-border border border-solid border-transparent ${blurred ? "" : ""} ${className}`}
      data-player-control-cluster={cluster}
    >
      {children}
    </div>
  );
}

export interface CourseLessonsSecondPressHoldProps {
  isSecondPressHolding: boolean;
  handlers: {
    onClick: MouseEventHandler<HTMLButtonElement>;
    onLostPointerCapture: PointerEventHandler<HTMLButtonElement>;
    onPointerCancel: PointerEventHandler<HTMLButtonElement>;
    onPointerDown: PointerEventHandler<HTMLButtonElement>;
    onPointerMove: PointerEventHandler<HTMLButtonElement>;
    onPointerUp: PointerEventHandler<HTMLButtonElement>;
  };
}

export interface LessonPlayerControlsProps {
  /**
   * The video area is short (see LESSON_PLAYER_SHORT_HEIGHT): the seek
   * tooltip becomes the centred pill, as on a phone.
   */
  shortPlayer?: boolean;
  /**
   * The video area is too short for anything above the control bar: the
   * seek pill shows the time alone and sits in the bar's own row.
   */
  seekTimeOnly?: boolean;
  ambientEnabled: boolean;
  autoplayEnabled: boolean;
  showAutoplayControl?: boolean;
  circularSettingsControl?: boolean;
  showLessonNavigation?: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  controlsSuppressed?: boolean;
  courseLessonsOpen?: boolean;
  courseLessonsDrawerOpen?: boolean;
  courseLessonsPanel?: ReactNode;
  courseLessonsSecondPressHold?: CourseLessonsSecondPressHoldProps;
  courseLessonsShortcutLabel?: string;
  courseLessonsSidePanel?: boolean;
  /** The lessons drawer is a bottom sheet rather than a side drawer. */
  courseLessonsBottomSheet?: boolean;
  /** Shown as the heading of the chapters panel. */
  lessonTitle?: string;
  /**
   * Element covering the course content column. When present the chapters
   * panel slides over it; otherwise it slides over the video's right edge.
   */
  chaptersPanelHost?: HTMLElement | null;
  onAmbientEnabledChange: (enabled: boolean) => void;
  onAutoplayEnabledChange: (enabled: boolean) => void;
  onCourseLessonsToggle?: (presentation: "drawer" | "side") => void;
  onGoNext: () => void;
  onGoPrevious: () => void;
  onMinimize?: () => void;
  onMobileLandscapeFullscreenChange?: (active: boolean) => void;
}

export function LessonPlayerMinimizeControl({
  icon,
  mobileFullscreen = false,
  onMinimize,
}: {
  icon: ReactNode;
  mobileFullscreen?: boolean;
  onMinimize: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto absolute left-2 top-2 ${mobileFullscreen ? "!left-3 sm:!left-3" : ""}`}
    >
      <PlayerIconButton
        label={LEARNING_PLAYER_MINIMIZE_LABEL}
        title={LEARNING_PLAYER_MINIMIZE_TITLE}
        aria-keyshortcuts={LEARNING_PLAYER_MINIMIZE_SHORTCUT}
        className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} !size-9 !rounded-full !bg-transparent !shadow-none drop-shadow-none`}
        icon={icon}
        onClick={onMinimize}
      />
    </div>
  );
}

function CourseLessonsButton({
  open,
  onToggle,
  secondPressHold,
  shortcutLabel,
  sidePanel,
  opensFromBottom,
  textSize = "xs",
  scrollportId,
  compact = false,
}: {
  /** Icon only, for a row with no room for the word and its arrow. */
  compact?: boolean;
  open: boolean;
  onToggle: () => void;
  secondPressHold?: CourseLessonsSecondPressHoldProps;
  shortcutLabel?: string;
  sidePanel: boolean;
  /**
   * The lessons open as a bottom sheet. Only then does the arrow point
   * down and flip while the sheet is open; everywhere else the lessons come
   * in from the right, so the arrow points right and stays put.
   */
  opensFromBottom: boolean;
  textSize?: "xs" | "sm";
  scrollportId?: string;
}) {
  const controlsId =
    scrollportId ??
    (sidePanel
      ? "learning-fullscreen-course-curriculum-scrollport"
      : "lesson-drawer-curriculum-scrollport");
  const textClasses = textSize === "sm" ? "!text-sm" : "!text-xs";
  const sizeClasses =
    textSize === "sm"
      ? "h-9.5 px-3.5 py-[3px] before:inset-0"
      : "h-11 px-4 py-0 before:inset-x-0.5 before:inset-y-1.5";
  const labelRowClass =
    textSize === "sm"
      ? "relative z-10 inline-flex h-8 -translate-y-px items-center gap-1.5 leading-none"
      : "relative z-10 inline-flex h-full -translate-y-px items-center gap-1.5 leading-none";

  return (
    <button
      type="button"
      aria-label={open ? "Close lessons" : "Open lessons"}
      aria-expanded={open}
      aria-controls={controlsId}
      aria-keyshortcuts={shortcutLabel ? "Alt+C" : undefined}
      title={
        shortcutLabel
          ? `${open ? "Close" : "Open"} lessons (${shortcutLabel})`
          : undefined
      }
      data-course-lessons-presentation={sidePanel ? "side" : "drawer"}
      data-course-lessons-open={sidePanel && open ? "true" : undefined}
      data-player-control=""
      data-player-control-hit-area="course-lessons"
      data-compact={compact ? "true" : undefined}
      data-second-press-holding={
        secondPressHold?.isSecondPressHolding || undefined
      }
      className={cn(
        `${MOBILE_TEXT_PILL_HIT_CLASS} relative inline-flex items-center justify-center font-semibold leading-none tracking-[0.01em] ${sizeClasses} ${textClasses}`,
        compact && "w-9.5 px-0",
      )}
      {...(secondPressHold?.handlers ?? {})}
      onClick={secondPressHold ? secondPressHold.handlers.onClick : onToggle}
    >
      <span className={labelRowClass}>
        {compact ? <Queue size={18} aria-hidden="true" /> : null}
        <span
          className={
            compact ? "sr-only" : "inline-flex items-center leading-none"
          }
        >
          Lessons
        </span>
        {compact ? null : (
          <span
            className={`learning-curriculum__section-arrow inline-flex items-center justify-center leading-none [&_svg]:block${open && opensFromBottom ? " is-open" : ""}`}
            aria-hidden="true"
          >
            {opensFromBottom ? (
              <CaretDown size={15} className="-mb-[2.5px]" />
            ) : (
              <CaretRight size={15} className="-mb-[2.5px]" />
            )}
          </span>
        )}
      </span>
    </button>
  );
}

function AutoplayToggle({
  enabled,
  mobileInteraction,
  onEnabledChange,
}: {
  enabled: boolean;
  mobileInteraction: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const { icons } = usePlayerTheme();
  const shownEnabled = enabled;
  const OnIcon = icons.play;
  const OffIcon = icons.pause;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shownEnabled}
      aria-label="Autoplay next lesson"
      title={shownEnabled ? "Autoplay is on" : "Autoplay is off"}
      data-player-control=""
      className={`group/autoplay relative inline-flex h-8 w-auto shrink-0 items-center justify-center px-2 text-white !shadow-none drop-shadow-none max-sm:hover:!bg-transparent max-sm:active:!bg-white/14 max-sm:focus-visible:!bg-transparent sm:h-9 sm:px-3 ${PLAYER_INNER_CONTROL_CLASS} ${mobileInteraction ? "sm:!h-8 sm:!px-2 sm:hover:!bg-transparent sm:active:!bg-white/14 sm:focus-visible:!bg-transparent" : ""}`}
      onClick={() => onEnabledChange(!shownEnabled)}
    >
      <span
        aria-hidden="true"
        className={`relative block h-3.5 w-8 rounded-full border-0 bg-black/40 transition-colors duration-150 sm:h-4 sm:w-9 ${mobileInteraction ? "sm:!h-3.5 sm:!w-8" : ""}`}
        data-autoplay-track=""
        data-autoplay-track-state={shownEnabled ? "on" : "off"}
      >
        <span
          className={`absolute top-1/2 grid size-4.5 -translate-y-1/2 place-items-center rounded-full shadow-[0_1px_5px_rgba(0,0,0,0.38)] transition-[left,background-color,color] sm:size-5 ${mobileInteraction ? "sm:!size-4.5" : ""} ${
            shownEnabled
              ? `left-3.5 bg-white text-black sm:left-4.5 ${mobileInteraction ? "sm:!left-3.5" : ""}`
              : "-left-0.5 bg-white/42 text-white"
          }`}
          data-autoplay-knob=""
        >
          <span
            className={shownEnabled ? "contents" : "hidden"}
            data-autoplay-icon="on"
          >
            <OnIcon
              size={11}
              active
              className={mobileInteraction ? "sm:!size-2.75" : "sm:size-3"}
            />
          </span>
          <span
            className={shownEnabled ? "hidden" : "contents"}
            data-autoplay-icon="off"
          >
            <OffIcon
              size={11}
              active={false}
              className={mobileInteraction ? "sm:!size-2.75" : "sm:size-3"}
            />
          </span>
        </span>
      </span>
    </button>
  );
}

function LessonNavigationButton({
  direction,
  disabled,
  className = PLAYER_INNER_CONTROL_CLASS,
  iconSize = 24,
  onClick,
}: {
  direction: "next" | "previous";
  disabled: boolean;
  className?: string;
  iconSize?: number;
  onClick: () => void;
}) {
  const { icons } = usePlayerTheme();
  const Icon = direction === "previous" ? icons.previous : icons.next;
  const shortcut = direction === "previous" ? "Shift+P" : "Shift+N";
  const label = `${direction === "previous" ? "Previous" : "Next"} lesson`;
  return (
    <PlayerIconButton
      label={label}
      aria-keyshortcuts={shortcut}
      title={`${label} (${shortcut})`}
      disabled={disabled}
      className={className}
      icon={<Icon size={iconSize} active />}
      onClick={onClick}
    />
  );
}

function LessonTimeControl({ mobile = false }: { mobile?: boolean }) {
  if (mobile) {
    return (
      <div
        className="inline-flex h-11 items-center"
        data-player-control-hit-area="time"
      >
        <TimeDisplay
          interactive
          className={`${MOBILE_TEXT_PILL_HIT_CLASS} !relative !inline-flex !h-11 !items-center !px-4 !py-0 !text-xs !leading-4 before:inset-x-0.5 before:inset-y-1.5`}
        />
      </div>
    );
  }

  return (
    <PlayerControlSurface
      blurred
      cluster="time"
      className="inline-flex h-9.5 items-center rounded-full p-[3px]"
    >
      <TimeDisplay
        interactive
        className={`${PLAYER_INNER_CONTROL_CLASS} !inline-flex !h-8 !items-center !px-3.5 !text-sm`}
      />
    </PlayerControlSurface>
  );
}

function AmbientSettingsItem({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <PlayerMenuItem
      data-menu-keep-open=""
      label="Ambient mode"
      checked={enabled}
      highlightChecked={false}
      leading={<AmbientModeIcon enabled={enabled} />}
      trailing={<MenuToggle checked={enabled} />}
      onClick={() => onEnabledChange(!enabled)}
    />
  );
}

function AmbientModeIcon({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-ambient-mode-icon=""
      data-ambient-mode-icon-state={enabled ? "on" : "off"}
      className={`block h-3 w-4.5 rounded-[2px] border border-current text-white transition-[border-color,box-shadow,color] duration-200 ease-out ${
        enabled ? "shadow-[0_0_10.5px_rgba(255,255,255,0.72)]" : "shadow-none"
      }`}
    />
  );
}

function MenuToggle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-player-menu-toggle=""
      data-player-menu-toggle-state={checked ? "on" : "off"}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors duration-150 ${
        checked
          ? "bg-[color-mix(in_srgb,var(--video-player-accent)_78%,var(--video-player-menu-surface))]"
          : "bg-[color-mix(in_srgb,var(--video-player-menu-text)_22%,transparent)]"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-(--video-player-menu-text) shadow-[0_1px_4px_rgba(0,0,0,0.32)] transition-transform duration-150 motion-reduce:transition-none ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </span>
  );
}

export function LessonPlayerControls({
  shortPlayer = false,
  seekTimeOnly = false,
  ambientEnabled,
  autoplayEnabled,
  showAutoplayControl = true,
  circularSettingsControl = false,
  showLessonNavigation = true,
  canGoNext,
  canGoPrevious,
  controlsSuppressed = false,
  courseLessonsOpen = false,
  courseLessonsDrawerOpen = false,
  courseLessonsPanel,
  courseLessonsSecondPressHold,
  courseLessonsShortcutLabel,
  courseLessonsSidePanel = false,
  courseLessonsBottomSheet = false,
  lessonTitle,
  chaptersPanelHost,
  onAmbientEnabledChange,
  onAutoplayEnabledChange,
  onCourseLessonsToggle,
  onGoNext,
  onGoPrevious,
  onMinimize,
  onMobileLandscapeFullscreenChange,
}: LessonPlayerControlsProps) {
  const chaptersPanelId = useId();
  const [chaptersRequested, setChaptersRequested] = useState(false);
  const hasChapters = useChapters().chapters.length > 0;
  const chaptersOpen = chaptersRequested && hasChapters;
  const wideViewport = useSyncExternalStore(
    subscribeToWideViewport,
    getWideViewportSnapshot,
    getWideViewportServerSnapshot,
  );
  const timelineAnchorRef = useRef<HTMLSpanElement>(null);
  const [timelineHost, setTimelineHost] = useState<HTMLElement | null>(null);
  const controlFrameRef = useRef<HTMLDivElement>(null);
  const actionsWithFullscreenWidthRef = useRef(0);
  const chaptersFullWidthRef = useRef(0);
  const lessonNavigationWidthRef = useRef(0);
  const lessonsFullWidthRef = useRef(0);
  const [desktopSettingsSheet, setDesktopSettingsSheet] =
    useState<DesktopSettingsSheetPlacement | null>(null);
  const desktopSettingsAsSheet = desktopSettingsSheet !== null;
  const [desktopTopRowCompactLevel, setDesktopTopRowCompactLevel] =
    useState<DesktopTopRowCompactLevel>(0);
  const [volumeCrowdsLessons, setVolumeCrowdsLessons] = useState(false);
  const [desktopEndControlsStage, setDesktopEndControlsStage] =
    useState<DesktopEndControlsStage>(0);
  const [mobileSettingsSheetHost, setMobileSettingsSheetHost] =
    useState<HTMLDivElement | null>(null);
  const playerTheme = usePlayerTheme();
  const MinimizeIcon = playerTheme.icons.minimize;
  const mobileInteraction = usePlayerMobileInteraction();
  const {
    buffering,
    controlsVisible,
    error,
    fullscreen,
    lifecycle,
    previewTime,
    scrubbing,
    settingsOpen,
  } = usePlayerState(
    ({ media, ui }) => ({
      buffering: media.buffering,
      controlsVisible: ui.controlsVisible,
      error: media.error,
      fullscreen: ui.fullscreen,
      lifecycle: media.lifecycle,
      previewTime: ui.previewTime,
      scrubbing: ui.scrubbing,
      settingsOpen: ui.settingsView !== "closed",
    }),
    (left, right) =>
      left.buffering === right.buffering &&
      left.controlsVisible === right.controlsVisible &&
      left.error === right.error &&
      left.fullscreen === right.fullscreen &&
      left.lifecycle === right.lifecycle &&
      left.previewTime === right.previewTime &&
      left.scrubbing === right.scrubbing &&
      left.settingsOpen === right.settingsOpen,
  );
  const ready = lifecycle === "ready";
  const hasError = lifecycle === "error" || Boolean(error);
  const loading = lifecycle !== "ready" || buffering;
  const visible = !controlsSuppressed && (controlsVisible || settingsOpen);
  const minimizeVisible =
    !controlsSuppressed && (visible || loading || hasError);
  const mobileFullscreen = mobileInteraction && fullscreen;
  // Pointer devices on a wide viewport keep the top edge for chapters only;
  // settings and autoplay join the bottom control row.
  const desktopLayout = !mobileInteraction && wideViewport;
  const lessonNavigationHidden = desktopLayout && desktopEndControlsStage >= 3;
  // Hovering the volume pill opens its slider over the time beside it. Once
  // the row is tight (Lessons has had to move up), it opens 30px less far.
  const volumeOpenWidthClass =
    desktopLayout && desktopEndControlsStage >= 2
      ? "hover:!w-24 focus-within:!w-24 [&:hover_.player-volume-slider]:!w-10.5 [&:focus-within_.player-volume-slider]:!w-10.5"
      : "hover:!w-31.5 focus-within:!w-31.5";
  // Fullscreen shows only the video shell, so the column host is off screen.
  const chaptersSideHost =
    desktopLayout && !fullscreen ? (chaptersPanelHost ?? null) : null;
  const persistentProgressVisible =
    ready && !controlsSuppressed && mobileInteraction && !fullscreen;
  const timelineDisplayed = visible || persistentProgressVisible;
  const landscapeOrientation = useSyncExternalStore(
    subscribeToLandscapeOrientation,
    getLandscapeOrientationSnapshot,
    getLandscapeOrientationServerSnapshot,
  );
  const mobileLandscapeFullscreen = mobileFullscreen && landscapeOrientation;
  const fullscreenCoursePanelVisible =
    mobileLandscapeFullscreen &&
    courseLessonsOpen &&
    Boolean(courseLessonsPanel);
  const mobileTimelineGeometry = scrubbing
    ? "max-sm:[&_[data-timeline-track]]:!h-0.75"
    : "max-sm:[&_[data-timeline-track]]:!h-0.5";
  const forcedMobileTimelineGeometry = mobileInteraction
    ? scrubbing
      ? "[&_[data-timeline-track]]:!h-0.75"
      : "[&_[data-timeline-track]]:!h-0.5"
    : "";

  const mobileVignettes = (
    <>
      <div
        aria-hidden="true"
        data-mobile-player-vignette="top"
        className={`absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_srgb,#05070b_50%,var(--accent)_4%)_0%,color-mix(in_srgb,#05070b_20%,var(--accent)_2%)_58%,transparent_100%)] sm:hidden ${mobileInteraction ? "sm:!block" : ""}`}
      />
      <div
        aria-hidden="true"
        data-mobile-player-vignette="bottom"
        className={`absolute inset-x-0 bottom-0 h-18 bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,#05070b_20%,var(--accent)_2%)_42%,color-mix(in_srgb,#05070b_54%,var(--accent)_4%)_100%)] sm:hidden ${mobileInteraction ? "sm:!block" : ""}`}
      />
    </>
  );

  useLayoutEffect(() => {
    setTimelineHost(
      timelineAnchorRef.current?.closest<HTMLElement>(".video-shell") ?? null,
    );
  }, []);

  useEffect(() => {
    onMobileLandscapeFullscreenChange?.(mobileLandscapeFullscreen);
  }, [mobileLandscapeFullscreen, onMobileLandscapeFullscreenChange]);

  // In fullscreen on a touch device at landscape widths, the timeline sits
  // 44px up and the corner controls 64px up, which leaves 12px between the
  // track and the buttons above it (they used to touch).
  const timelineLayer = (
    <div
      data-player-timeline-wrap=""
      data-player-timeline-layer=""
      className={`pointer-events-none absolute inset-x-0 bottom-0 translate-y-1/2 z-80 overflow-visible max-sm:z-170 transition-opacity duration-200 motion-reduce:transition-none sm:inset-x-3 sm:bottom-16 sm:translate-y-0 ${EXPAND_MOTION_HIDDEN_CLASS} ${timelineDisplayed ? "visible opacity-100" : "invisible opacity-0"} ${visible ? "" : "[&_*]:!pointer-events-none"} ${mobileInteraction ? (mobileFullscreen ? (fullscreenCoursePanelVisible ? "!left-(--learning-fullscreen-video-offset-x) !right-auto !bottom-0 !z-170 !w-(--learning-fullscreen-video-width) !max-w-full !translate-x-0 !translate-y-1/2 !px-3 sm:!left-(--learning-fullscreen-video-offset-x) sm:!right-auto sm:!bottom-11 sm:!w-(--learning-fullscreen-video-width) sm:!translate-x-0 sm:!translate-y-0 sm:!px-3" : "!left-1/2 !right-auto !bottom-0 !z-170 !w-[min(100%,calc(100dvh*16/9))] !max-w-full !-translate-x-1/2 !translate-y-1/2 !px-3 sm:!left-1/2 sm:!right-auto sm:!bottom-11 sm:!w-[min(100%,calc(100dvh*16/9))] sm:!-translate-x-1/2 sm:!translate-y-0 sm:!px-3") : "!z-170 sm:!inset-x-0 sm:!bottom-2 sm:!translate-y-0") : ""}`}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      <Timeline
        previewLayout={
          mobileInteraction || shortPlayer ? "centered-pill" : "follow-pill"
        }
        className={`${shortPlayer && !mobileInteraction ? (seekTimeOnly ? "[&_[data-video-player-preview]]:!bottom-5.5 [&_[data-video-player-preview]]:!mb-0 [&_[data-video-player-preview]>span+span]:hidden" : "[&_[data-video-player-preview]]:!bottom-17 [&_[data-video-player-preview]]:!mb-0") : ""} pointer-events-none overflow-visible [&_[role=slider]]:pointer-events-auto max-sm:[&_[role=slider]]:h-7 max-sm:[&_[data-video-player-preview]]:!bottom-8 max-sm:[&_[data-video-player-preview]]:!mb-0 max-sm:[&_[data-timeline-buffered-range]]:rounded-none max-sm:[&_[data-timeline-progress]]:rounded-none max-sm:[&_[data-timeline-track]]:rounded-none max-sm:[&_[data-timeline-track]]:!scale-y-100 max-sm:[&_[data-timeline-thumb]]:z-80 ${mobileTimelineGeometry} ${forcedMobileTimelineGeometry} ${mobileInteraction ? "[&_[role=slider]]:!h-7 [&_[data-video-player-preview]]:!bottom-8 [&_[data-video-player-preview]]:!mb-0 [&_[data-timeline-buffered-range]]:!rounded-none [&_[data-timeline-progress]]:!rounded-none [&_[data-timeline-track]]:!rounded-none [&_[data-timeline-thumb]]:!z-80" : ""}`}
      />
    </div>
  );

  const mobileSheetPanelClassName = mobileLandscapeFullscreen
    ? fullscreenCoursePanelVisible
      ? "[&&]:!rounded-b-none !inset-x-auto !right-auto !left-[calc(var(--learning-fullscreen-video-offset-x)+var(--learning-fullscreen-video-width)/2)] !w-[min(100dvh,var(--learning-fullscreen-video-width))] !-translate-x-1/2"
      : "[&&]:!rounded-b-none mx-auto max-w-[100dvh]"
    : undefined;
  const mobileSheetPortalTarget = mobileLandscapeFullscreen
    ? mobileSettingsSheetHost
    : undefined;
  // On a phone the chapters button sits in the bottom-left corner, right
  // after the time.
  const mobileChaptersButton =
    hasChapters && mobileInteraction ? (
      <LessonChaptersSheetMenu
        // On the lesson page the sheet snaps like the course content
        // drawer: edge to edge, its top just above the video's bottom.
        // Fullscreen letterboxes the video inside the shell, so the
        // shell's bottom says nothing there and the sheet keeps its
        // own size.
        getSheetHeight={
          mobileFullscreen
            ? undefined
            : () => {
                const videoBottom =
                  timelineHost?.getBoundingClientRect().bottom;
                if (!Number.isFinite(videoBottom) || videoBottom! <= 0) {
                  return null;
                }
                return getPhoneLessonDrawerCollapsedSnapPoint(
                  window.innerHeight,
                  videoBottom,
                );
              }
        }
        mobileSheetPanelClassName={mobileSheetPanelClassName}
        mobileSheetPortalTarget={mobileSheetPortalTarget}
        // A 32px circle, like the fullscreen button in the opposite corner.
        triggerClassName={getPlayerIconPillClass(mobileInteraction)
          .replace("!w-auto", "!w-8")
          .replaceAll("!px-2", "!px-0")}
      />
    ) : null;

  const mobileTimeCorner = (
    <div
      data-mobile-player-corner="time"
      data-preview-obscured={previewTime !== null ? "true" : "false"}
      className={`pointer-events-none absolute bottom-2.5 left-2 flex h-11 w-fit items-center transition-opacity duration-150 ease-out motion-reduce:transition-none sm:bottom-2.5 sm:left-3 sm:right-auto sm:h-auto ${mobileInteraction ? `sm:!h-11 ${mobileFullscreen ? "!bottom-15 !left-3 sm:!bottom-16 sm:!left-3" : "sm:!left-2"}` : ""} ${
        fullscreenCoursePanelVisible ? "!static sm:!static" : ""
      } ${
        previewTime !== null
          ? `max-sm:pointer-events-none max-sm:opacity-0 ${mobileInteraction ? "sm:!pointer-events-none sm:!opacity-0" : ""}`
          : "max-sm:opacity-100"
      }`}
    >
      <div
        className={`pointer-events-auto flex items-center gap-1 sm:hidden ${mobileInteraction ? "sm:!flex" : ""}`}
      >
        <LessonTimeControl mobile />
        {mobileChaptersButton ? (
          <span
            data-player-control-hit-area="chapters"
            className="grid size-8 place-items-center rounded-full bg-(--video-player-control-surface) shadow-(--video-player-control-shadow)"
          >
            {mobileChaptersButton}
          </span>
        ) : null}
      </div>
      <div
        className={`pointer-events-auto hidden items-center gap-2 sm:flex ${mobileInteraction ? "sm:!hidden" : ""}`}
        data-player-desktop-start-controls=""
      >
        <PlayerControlSurface
          blurred
          cluster="playback"
          className="inline-flex size-10.5 items-center justify-center rounded-full p-[3px]"
        >
          <PlayButton className={PLAYER_INNER_CONTROL_CLASS} iconSize={23} />
        </PlayerControlSurface>
        {showLessonNavigation && !lessonNavigationHidden ? (
          <PlayerControlSurface
            blurred
            cluster="lesson-navigation"
            className="inline-flex h-10.5 items-center rounded-full p-[3px]"
          >
            <LessonNavigationButton
              direction="previous"
              disabled={!canGoPrevious}
              onClick={onGoPrevious}
            />
            <LessonNavigationButton
              direction="next"
              disabled={!canGoNext}
              onClick={onGoNext}
            />
          </PlayerControlSurface>
        ) : null}
        <VolumeControl
          collapsible
          className={`${PLAYER_SURFACE_CLASS} relative isolate h-10.5 !w-10.5 shrink-0 rounded-full p-1 before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-full before:bg-transparent before:transition-colors before:duration-150 before:ease-out before:content-[''] ${volumeOpenWidthClass} hover:before:bg-(--video-player-control-surface-hover) focus-within:before:bg-(--video-player-control-surface-hover) [&>*]:relative [&>*]:z-10 [&_.player-volume-slider]:!h-8.5`}
          muteButtonClassName={`${PLAYER_INNER_CONTROL_CLASS} ${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} !size-8.5`}
        />
        <LessonTimeControl />
      </div>
    </div>
  );

  const mobileFullscreenCorner = (
    <div
      data-mobile-player-corner="fullscreen"
      data-preview-obscured={previewTime !== null ? "true" : "false"}
      className={`pointer-events-auto absolute bottom-2.5 right-2 z-60 transition-opacity duration-150 ease-out motion-reduce:transition-none sm:hidden ${mobileInteraction ? `sm:!block ${mobileFullscreen ? "!bottom-15 !right-3 sm:!bottom-16 sm:!right-3" : ""}` : ""} ${
        fullscreenCoursePanelVisible ? "!static sm:!static" : ""
      } ${
        previewTime !== null
          ? `max-sm:pointer-events-none max-sm:opacity-0 ${mobileInteraction ? "sm:!pointer-events-none sm:!opacity-0" : ""}`
          : "max-sm:opacity-100"
      }`}
    >
      <div className="inline-flex items-center gap-1.5">
        {onCourseLessonsToggle ? (
          <CourseLessonsButton
            open={
              mobileLandscapeFullscreen
                ? courseLessonsOpen
                : courseLessonsDrawerOpen
            }
            onToggle={() =>
              onCourseLessonsToggle(
                mobileLandscapeFullscreen ? "side" : "drawer",
              )
            }
            sidePanel={mobileLandscapeFullscreen}
            opensFromBottom={
              !mobileLandscapeFullscreen && courseLessonsBottomSheet
            }
          />
        ) : null}
        <CircularFullscreenButton />
      </div>
    </div>
  );

  const bottomCornerControlsLayer = (
    <div
      data-player-bottom-corner-controls-layer=""
      className={`pointer-events-none absolute z-180 text-white transition-opacity duration-200 motion-reduce:transition-none ${EXPAND_MOTION_HIDDEN_CLASS} ${
        mobileFullscreen
          ? "inset-y-0 left-1/2 right-auto w-[min(100%,calc(100dvh*16/9))] max-w-full -translate-x-1/2"
          : "inset-0"
      } ${
        visible
          ? "visible opacity-100"
          : "invisible opacity-0 [&_*]:!pointer-events-none"
      }`}
      style={getPlayerThemeStyle(playerTheme)}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      {mobileTimeCorner}
      {mobileFullscreenCorner}
    </div>
  );

  const fullscreenBottomControlsLayer = (
    <div
      data-player-fullscreen-bottom-controls=""
      className={`pointer-events-none absolute bottom-15 sm:bottom-16 left-(--learning-fullscreen-video-offset-x) z-180 flex h-11 w-(--learning-fullscreen-video-width) max-w-full items-center justify-between px-3 text-white transition-opacity duration-200 motion-reduce:transition-none ${
        visible
          ? "visible opacity-100"
          : "invisible opacity-0 [&_*]:!pointer-events-none"
      }`}
      style={getPlayerThemeStyle(playerTheme)}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      {mobileTimeCorner}
      {mobileFullscreenCorner}
    </div>
  );

  // On desktop, fullscreen sits in the same pill as autoplay and settings.
  // The circular settings variant is a single round button, so it keeps the
  // separate fullscreen button.
  const actionsAtTop = desktopLayout && desktopEndControlsStage >= 1;
  const lessonsAtTop = desktopLayout && desktopEndControlsStage >= 2;
  const actionsInBottomRow = desktopLayout && !actionsAtTop;
  const fullscreenInActionsPill =
    actionsInBottomRow && !circularSettingsControl;
  const playerActions = (
    <PlayerControlSurface
      cluster="player-actions"
      className={`relative isolate flex h-8 items-center gap-1 rounded-full !bg-transparent p-0 !shadow-none before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-full before:bg-(--video-player-control-surface) before:shadow-(--video-player-control-shadow) before:content-[''] [&>*]:relative [&>*]:z-10 max-sm:before:hidden sm:h-10.5 sm:p-[3px] ${mobileInteraction ? "sm:!h-8 sm:!p-0 sm:before:hidden" : ""} ${circularSettingsControl ? "!size-9 !rounded-full !p-0 !justify-center sm:!size-9 sm:!p-0 [&>div]:!size-9 [&>div>button]:!size-9" : ""}`}
    >
      <ZoomLevelIndicator className="mr-0.5" />
      {showAutoplayControl ? (
        <AutoplayToggle
          enabled={autoplayEnabled}
          mobileInteraction={mobileInteraction}
          onEnabledChange={onAutoplayEnabledChange}
        />
      ) : null}
      <span
        className={`inline-flex sm:hidden ${mobileInteraction ? "sm:!inline-flex" : ""}`}
        data-mobile-volume-control=""
      >
        <MuteButton
          className={getPlayerIconPillClass(mobileInteraction)}
          iconSize={22}
        />
      </span>
      <SettingsMenu
        includePictureInPicture
        mobilePresentation="sheet"
        forceSheet={desktopSettingsAsSheet}
        mobileSheetPanelClassName={mobileSheetPanelClassName}
        mobileSheetPortalTarget={mobileSheetPortalTarget}
        mobileSheetStyle={
          desktopSettingsSheet && !mobileInteraction
            ? {
                // The theme fixes the panel radius from this variable.
                ["--video-player-menu-radius" as string]:
                  desktopSettingsSheet.bottomRadius,
                bottom: desktopSettingsSheet.bottom,
                left: desktopSettingsSheet.left,
                right: "auto",
                width: desktopSettingsSheet.width,
              }
            : undefined
        }
        triggerClassName={cn(
          getPlayerIconPillClass(mobileInteraction, circularSettingsControl),
          circularSettingsControl &&
            "!inline-flex !size-9 !w-9 !items-center !justify-center !p-0 !rounded-full !leading-none [&>svg]:!block [&>svg]:!shrink-0",
        )}
        extraMainItems={
          <AmbientSettingsItem
            enabled={ambientEnabled}
            onEnabledChange={onAmbientEnabledChange}
          />
        }
        side={actionsInBottomRow ? "top" : "bottom"}
      />
      {fullscreenInActionsPill ? (
        <FullscreenButton
          className={getPlayerIconPillClass(mobileInteraction)}
          iconSize={22}
        />
      ) : null}
    </PlayerControlSurface>
  );

  const desktopLessonsButton = onCourseLessonsToggle ? (
    <div
      // Where the open volume slider would run the time into this button,
      // the button fades away while the slider is out (hovered, or focused
      // from the keyboard) and fades back when it closes.
      className={`relative isolate z-10 shrink-0 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
        volumeCrowdsLessons && !lessonsAtTop
          ? "[.video-shell:has(.player-volume-group:is(:hover,:focus-within))_&]:pointer-events-none [.video-shell:has(.player-volume-group:is(:hover,:focus-within))_&]:opacity-0"
          : ""
      }`}
      data-player-desktop-lessons=""
    >
      <CourseLessonsButton
        open={
          courseLessonsSidePanel ? courseLessonsOpen : courseLessonsDrawerOpen
        }
        onToggle={() =>
          onCourseLessonsToggle(courseLessonsSidePanel ? "side" : "drawer")
        }
        secondPressHold={courseLessonsSecondPressHold}
        shortcutLabel={courseLessonsShortcutLabel}
        sidePanel={courseLessonsSidePanel}
        opensFromBottom={!courseLessonsSidePanel && courseLessonsBottomSheet}
        compact={lessonsAtTop && desktopTopRowCompactLevel >= 2}
        textSize="sm"
        scrollportId={
          courseLessonsSidePanel
            ? "learning-course-curriculum-scrollport"
            : "lesson-drawer-curriculum-scrollport"
        }
      />
    </div>
  ) : null;

  const hasLessonsButton = Boolean(onCourseLessonsToggle);
  // Re-measured whenever the player or the pills beside the time change
  // width: dragging the sidebar or the course content, a longer time, a
  // lesson with or without the Lessons button.
  useLayoutEffect(() => {
    const frame = controlFrameRef.current;
    if (!desktopLayout || !frame || !timelineHost) {
      setDesktopEndControlsStage(0);
      setDesktopTopRowCompactLevel(0);
      setDesktopSettingsSheet(null);
      setVolumeCrowdsLessons(false);
      return undefined;
    }
    if (!showLessonNavigation) lessonNavigationWidthRef.current = 0;
    const measure = () => {
      const stage = measureDesktopEndControlsStage(
        timelineHost,
        frame,
        actionsWithFullscreenWidthRef,
        lessonNavigationWidthRef,
        lessonsFullWidthRef,
      );
      setDesktopEndControlsStage(stage);
      const sheet =
        frame.clientHeight < DESKTOP_SETTINGS_POPOVER_MIN_PLAYER_HEIGHT
          ? measureDesktopSettingsSheetPlacement(timelineHost)
          : null;
      setDesktopSettingsSheet((current) =>
        current?.bottom === sheet?.bottom &&
        current?.bottomRadius === sheet?.bottomRadius &&
        current?.left === sheet?.left &&
        current?.width === sheet?.width
          ? current
          : sheet,
      );
      setVolumeCrowdsLessons(measureVolumeCrowdsLessons(timelineHost));
      setDesktopTopRowCompactLevel(
        measureDesktopTopRowCompactLevel(
          timelineHost,
          frame,
          stage,
          chaptersFullWidthRef,
          lessonsFullWidthRef,
        ),
      );
    };
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    const start = timelineHost.querySelector(
      "[data-player-desktop-start-controls]",
    );
    if (start) observer.observe(start);
    return () => observer.disconnect();
  }, [
    desktopLayout,
    desktopEndControlsStage,
    desktopTopRowCompactLevel,
    volumeCrowdsLessons,
    hasChapters,
    showAutoplayControl,
    showLessonNavigation,
    timelineHost,
    hasLessonsButton,
  ]);

  const chaptersPanel =
    hasChapters && !mobileInteraction ? (
      <LessonChaptersPanel
        id={chaptersPanelId}
        open={chaptersOpen}
        lessonTitle={lessonTitle}
        placement={chaptersSideHost ? "side" : "player"}
        onClose={() => setChaptersRequested(false)}
      />
    ) : null;

  return (
    <>
      {timelineHost && mobileLandscapeFullscreen
        ? createPortal(
            <div
              ref={setMobileSettingsSheetHost}
              data-learning-mobile-settings-sheet-host=""
              className="pointer-events-none absolute inset-0 z-200 overflow-hidden"
            />,
            timelineHost,
          )
        : null}
      {timelineHost && fullscreenCoursePanelVisible
        ? createPortal(courseLessonsPanel, timelineHost)
        : null}
      {timelineHost && fullscreenCoursePanelVisible
        ? createPortal(fullscreenBottomControlsLayer, timelineHost)
        : null}
      {timelineHost && !fullscreenCoursePanelVisible
        ? createPortal(bottomCornerControlsLayer, timelineHost)
        : null}
      {chaptersPanel && (chaptersSideHost ?? timelineHost)
        ? createPortal(
            chaptersPanel,
            (chaptersSideHost ?? timelineHost) as HTMLElement,
          )
        : null}
      {timelineHost && mobileFullscreen
        ? createPortal(
            <div
              aria-hidden="true"
              data-mobile-player-fullscreen-vignette-layer=""
              className={`pointer-events-none absolute inset-y-0 z-20 ${
                fullscreenCoursePanelVisible
                  ? "left-(--learning-fullscreen-video-offset-x) w-(--learning-fullscreen-video-width)"
                  : "left-0 right-0"
              }`}
              style={getPlayerThemeStyle(playerTheme)}
            >
              {mobileVignettes}
            </div>,
            timelineHost,
          )
        : null}
      {onMinimize ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-50 text-white transition-opacity duration-200 motion-reduce:transition-none",
            EXPAND_MOTION_HIDDEN_CLASS,
            minimizeVisible
              ? "visible opacity-100"
              : "invisible opacity-0 [&_*]:!pointer-events-none",
            controlsSuppressed && "transition-none",
          )}
          aria-hidden={minimizeVisible ? undefined : true}
          inert={minimizeVisible ? undefined : true}
          data-video-player-control-layer=""
          data-learning-player-minimize-layer=""
        >
          <div
            className={
              mobileFullscreen
                ? fullscreenCoursePanelVisible
                  ? "absolute inset-0"
                  : "absolute inset-y-0 left-1/2 w-[min(100%,calc(100dvh*16/9))] max-w-full -translate-x-1/2"
                : "absolute inset-0"
            }
          >
            <LessonPlayerMinimizeControl
              icon={<MinimizeIcon size={22} />}
              mobileFullscreen={mobileFullscreen}
              onMinimize={onMinimize}
            />
          </div>
        </div>
      ) : null}
      <div
        className={`pointer-events-none absolute inset-0 ${settingsOpen ? "z-180" : "z-30"} text-white transition-opacity duration-200 motion-reduce:transition-none ${EXPAND_MOTION_HIDDEN_CLASS} ${
          visible
            ? "visible opacity-100"
            : `invisible opacity-0 [&_*]:!pointer-events-none ${
                controlsSuppressed ? "transition-none" : ""
              }`
        }`}
        aria-hidden={visible ? undefined : true}
        inert={visible ? undefined : true}
        data-video-player-control-layer=""
        data-lesson-player-controls=""
      >
        <span ref={timelineAnchorRef} hidden />
        {timelineHost
          ? createPortal(timelineLayer, timelineHost)
          : timelineLayer}
        <div
          className={
            mobileFullscreen
              ? fullscreenCoursePanelVisible
                ? "absolute inset-0"
                : "absolute inset-y-0 left-1/2 w-[min(100%,calc(100dvh*16/9))] max-w-full -translate-x-1/2"
              : "absolute inset-0"
          }
          ref={controlFrameRef}
          data-player-control-frame=""
          data-player-mobile-fullscreen-frame={
            mobileFullscreen ? "true" : undefined
          }
        >
          {!mobileFullscreen ? mobileVignettes : null}

          <div
            className={`pointer-events-auto absolute right-2 top-2 flex items-center gap-2 ${mobileFullscreen ? "!left-auto !right-3 sm:!left-auto sm:!right-3" : ""}`}
          >
            {hasChapters && !mobileInteraction ? (
              <LessonChaptersToggleButton
                open={chaptersOpen}
                panelId={chaptersPanelId}
                compact={desktopLayout && desktopTopRowCompactLevel >= 1}
                className={`${MOBILE_TEXT_PILL_HIT_CLASS} h-9.5 px-3.5 py-[3px] !text-sm before:inset-0`}
                onToggle={() => setChaptersRequested((requested) => !requested)}
              />
            ) : null}
            {lessonsAtTop ? desktopLessonsButton : null}
            {desktopLayout && !actionsAtTop ? null : playerActions}
          </div>

          {!mobileInteraction ? (
            <div
              data-player-desktop-end-controls=""
              className="pointer-events-auto absolute right-2 bottom-2.5 hidden items-center gap-2 sm:flex"
            >
              {lessonsAtTop ? null : desktopLessonsButton}
              {actionsInBottomRow ? playerActions : null}
              {fullscreenInActionsPill ? null : (
                <CircularFullscreenButton desktop />
              )}
            </div>
          ) : null}

          {!timelineHost && !fullscreenCoursePanelVisible
            ? mobileTimeCorner
            : null}
          {!timelineHost && !fullscreenCoursePanelVisible
            ? mobileFullscreenCorner
            : null}
        </div>
      </div>
    </>
  );
}

export interface LessonCentralControlsProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  showLessonNavigation?: boolean;
  controlsSuppressed?: boolean;
  onGoNext: () => void;
  onGoPrevious: () => void;
}

export function LessonCentralControls({
  canGoNext,
  canGoPrevious,
  showLessonNavigation = true,
  controlsSuppressed = false,
  onGoNext,
  onGoPrevious,
}: LessonCentralControlsProps) {
  const { buffering, controlsVisible, lifecycle } = usePlayerState(
    ({ media, ui }) => ({
      buffering: media.buffering,
      controlsVisible: ui.controlsVisible,
      lifecycle: media.lifecycle,
    }),
    (left, right) =>
      left.buffering === right.buffering &&
      left.controlsVisible === right.controlsVisible &&
      left.lifecycle === right.lifecycle,
  );
  const mobileInteraction = usePlayerMobileInteraction();
  const loading = lifecycle !== "ready" || buffering;
  const visible = !controlsSuppressed && !loading && controlsVisible;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 hidden place-items-center transition-opacity duration-200 max-sm:grid ${EXPAND_MOTION_HIDDEN_CLASS} ${mobileInteraction ? "sm:!grid" : ""} ${
        visible
          ? "visible opacity-100"
          : `invisible opacity-0 [&_*]:!pointer-events-none ${
              controlsSuppressed || loading ? "transition-none" : ""
            }`
      }`}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
      data-video-player-control-layer=""
      data-lesson-central-controls=""
      data-player-loading={loading ? "true" : undefined}
    >
      <div className="pointer-events-auto flex items-center gap-6">
        {showLessonNavigation ? (
          <PlayerControlSurface
            cluster="mobile-previous"
            className="grid size-11.5 place-items-center rounded-full !border-0 p-0 backdrop-blur-none"
          >
            <LessonNavigationButton
              direction="previous"
              disabled={!canGoPrevious}
              className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} ${PLAYER_INNER_CONTROL_CLASS} !size-11.5`}
              iconSize={22}
              onClick={onGoPrevious}
            />
          </PlayerControlSurface>
        ) : null}
        <PlayerControlSurface
          cluster="mobile-play"
          className="grid size-15.5 place-items-center rounded-full !border-0 p-0 backdrop-blur-none"
        >
          <PlayButton
            className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} ${PLAYER_INNER_CONTROL_CLASS} !size-15.5`}
            hideControlsOnPlay
            iconSize={29}
          />
        </PlayerControlSurface>
        {showLessonNavigation ? (
          <PlayerControlSurface
            cluster="mobile-next"
            className="grid size-11.5 place-items-center rounded-full !border-0 p-0 backdrop-blur-none"
          >
            <LessonNavigationButton
              direction="next"
              disabled={!canGoNext}
              className={`${MOBILE_INVISIBLE_HIT_SURFACE_CLASS} ${PLAYER_INNER_CONTROL_CLASS} !size-11.5`}
              iconSize={22}
              onClick={onGoNext}
            />
          </PlayerControlSurface>
        ) : null}
      </div>
    </div>
  );
}
