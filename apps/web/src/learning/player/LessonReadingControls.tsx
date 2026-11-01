import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { DeviceRotateIcon as DeviceRotate } from "@phosphor-icons/react/DeviceRotate";
import { TextAaIcon as TextAa } from "@phosphor-icons/react/TextAa";
import {
  LessonNavigationPill,
  MOBILE_INVISIBLE_HIT_SURFACE_CLASS,
  PLAYER_INNER_CONTROL_CLASS,
  PLAYER_SURFACE_CLASS,
  PlayerCircleIconButton,
} from "./LessonPlayerControls";
import {
  READING_FONT_SCALE_MAX,
  READING_FONT_SCALE_MIN,
  READING_FONT_SCALE_STEP,
  useReadingFontScale,
} from "./readingFontScale";
import {
  getDocumentFullscreenElement,
  isInstalledAppDisplay,
  unlockScreenOrientation,
} from "../../fullscreen";
import { cn } from "../../lib/utils";

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface WebkitFullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
}

type ReadingOrientation = "portrait" | "landscape";

interface LockableOrientation {
  lock?: (orientation: ReadingOrientation) => Promise<void> | void;
}

const currentOrientation = (): ReadingOrientation =>
  window.matchMedia("(orientation: landscape)").matches
    ? "landscape"
    : "portrait";

/** Turns the screen to `orientation`; false where the browser cannot. */
async function lockOrientation(orientation: ReadingOrientation) {
  const target = window.screen?.orientation as LockableOrientation | undefined;
  if (!target?.lock) return false;
  try {
    await Promise.resolve(target.lock(orientation));
    return true;
  } catch {
    return false;
  }
}

/**
 * A reading lesson's full screen: the reading area alone fills the screen,
 * the way it is held (upright on a phone, sideways on a laptop or a tablet
 * held sideways). While it is full screen, a touch device can also turn it
 * the other way.
 */
export function useLessonReadingFullscreen(
  surfaceRef: RefObject<HTMLElement | null>,
  /** A reading is on the stage (the surface is mounted). */
  enabled: boolean,
) {
  const [fullscreen, setFullscreen] = useState(false);
  const [available, setAvailable] = useState(false);
  // Turning the screen needs a touch device whose browser can lock it,
  // which is only known by trying; it is offered until a try fails.
  const [canRotate, setCanRotate] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const surface = surfaceRef.current as WebkitFullscreenElement | null;
    setAvailable(
      Boolean(surface?.requestFullscreen || surface?.webkitRequestFullscreen) &&
        !isInstalledAppDisplay(),
    );
    setCanRotate(
      window.matchMedia("(pointer: coarse)").matches &&
        typeof (window.screen?.orientation as LockableOrientation | undefined)
          ?.lock === "function",
    );
    const sync = () => {
      const active =
        surface !== null && getDocumentFullscreenElement() === surface;
      setFullscreen(active);
      if (!active) unlockScreenOrientation();
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [enabled, surfaceRef]);

  const exit = useCallback(async () => {
    if (!getDocumentFullscreenElement()) return;
    const target = document as WebkitFullscreenDocument;
    try {
      await Promise.resolve(
        document.exitFullscreen?.() ?? target.webkitExitFullscreen?.(),
      );
    } catch {
      // Already left (the back gesture, the Escape key).
    }
  }, []);

  const enter = useCallback(async () => {
    const surface = surfaceRef.current as WebkitFullscreenElement | null;
    if (!surface) return;
    try {
      await Promise.resolve(
        surface.requestFullscreen?.() ?? surface.webkitRequestFullscreen?.(),
      );
    } catch {
      return;
    }
    // A phone's browser may turn sideways on its own in full screen; the
    // reading keeps the way the device is held.
    if (window.matchMedia("(pointer: coarse)").matches) {
      void lockOrientation(currentOrientation());
    }
  }, [surfaceRef]);

  const rotate = useCallback(async () => {
    const next = currentOrientation() === "portrait" ? "landscape" : "portrait";
    if (!(await lockOrientation(next))) setCanRotate(false);
  }, []);

  // Full screen on a touch screen held (or turned) sideways: the state in
  // which a video shows its lessons beside it rather than over the page.
  const [touchLandscape, setTouchLandscape] = useState(false);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const coarse = window.matchMedia("(pointer: coarse)");
    const landscape = window.matchMedia("(orientation: landscape)");
    const sync = () => setTouchLandscape(coarse.matches && landscape.matches);
    sync();
    landscape.addEventListener("change", sync);
    return () => {
      landscape.removeEventListener("change", sync);
      setTouchLandscape(false);
    };
  }, [fullscreen]);

  return {
    available,
    canRotate: canRotate && fullscreen,
    enter,
    exit,
    fullscreen,
    landscapeOnTouch: fullscreen && touchLandscape,
    rotate,
  };
}

/**
 * The reading's controls sit in one row along its bottom edge, the same
 * pieces at the same sizes as a video's row on a computer: previous and
 * next, then the text size where a video has its volume, at the left;
 * Lessons, rotate and full screen at the right. A tap on the text (or the
 * mouse leaving the reading) puts the whole row away, leaving the text
 * alone (see `LessonVideoPlayer`).
 */
const readingControlRowClass = cn(
  "pointer-events-auto absolute bottom-2.5 z-30 flex items-center gap-2 transition-opacity duration-200",
  // A video's circles are see-through over a moving picture; over lines of
  // text they almost vanish. Half the theme's own circle colour is laid
  // over it once more (a half-clear dark one ends near 62%): a little
  // darker, still see-through, keeping each theme's hue and its icon
  // colour's contrast, and the text behind is blurred.
  "[&_[data-player-control-cluster]]:bg-[linear-gradient(color-mix(in_srgb,var(--video-player-control-surface)_50%,transparent),color-mix(in_srgb,var(--video-player-control-surface)_50%,transparent))]! [&_[data-player-control-cluster]]:backdrop-blur-sm!",
  // The Lessons pill draws its surface on its `::before`; it gets the same.
  "text-(--video-player-control-text) [&_[data-player-control-hit-area=course-lessons]]:before:bg-[linear-gradient(color-mix(in_srgb,var(--video-player-control-surface)_50%,transparent),color-mix(in_srgb,var(--video-player-control-surface)_50%,transparent))]! [&_[data-player-control-hit-area=course-lessons]]:before:backdrop-blur-sm",
);

/** The open text size control's width (`w-31.5`) and the row's gap. */
const READING_FONT_SIZE_OPEN_WIDTH = 126;
const READING_ROW_GAP = 8;

/**
 * The text size, where a video has its volume: the same 42px circle, which
 * opens into a slider while the pointer is over it (or it has the keyboard),
 * and on a touch screen when its icon is tapped.
 */
function ReadingFontSizeControl() {
  const [scale, setScale] = useReadingFontScale();
  // Opened by a tap on the icon, by the mouse over it, or by the keyboard
  // in it; any of them holds it open.
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const expanded = open || hovered || focused;
  const controlRef = useRef<HTMLDivElement>(null);
  const filled =
    ((scale - READING_FONT_SCALE_MIN) /
      (READING_FONT_SCALE_MAX - READING_FONT_SCALE_MIN)) *
    100;

  // Where the open slider would run into the Lessons button (a narrow
  // phone), the button fades away while the slider is out, as a video's
  // does beside its volume slider. The reading's surface carries the mark.
  useLayoutEffect(() => {
    const control = controlRef.current;
    const shell = control?.closest<HTMLElement>(".video-shell");
    if (!control || !shell) return undefined;
    const lessons = shell.querySelector("[data-reading-lessons]");
    const crowded =
      expanded &&
      lessons !== null &&
      control.getBoundingClientRect().left +
        READING_FONT_SIZE_OPEN_WIDTH +
        READING_ROW_GAP >
        lessons.getBoundingClientRect().left;
    if (!crowded) return undefined;
    shell.setAttribute("data-reading-lessons-crowded", "");
    return () => shell.removeAttribute("data-reading-lessons-crowded");
  }, [expanded]);

  return (
    <div
      ref={controlRef}
      className={cn(
        PLAYER_SURFACE_CLASS,
        "relative isolate flex h-10.5 w-10.5 shrink-0 items-center overflow-hidden rounded-full p-1 transition-[width] duration-200 ease-out",
        expanded && "w-31.5",
      )}
      data-player-control-cluster="reading-font-size"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
          setFocused(false);
        }
      }}
    >
      <button
        type="button"
        aria-label="Text size"
        title="Text size"
        aria-expanded={open}
        className={cn(
          MOBILE_INVISIBLE_HIT_SURFACE_CLASS,
          PLAYER_INNER_CONTROL_CLASS,
          "grid size-8.5 shrink-0 place-items-center",
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <TextAa size={23} weight="bold" aria-hidden="true" />
      </button>
      <input
        type="range"
        min={READING_FONT_SCALE_MIN}
        max={READING_FONT_SCALE_MAX}
        step={READING_FONT_SCALE_STEP}
        value={scale}
        aria-label="Text size"
        aria-valuetext={`${Math.round(scale * 100)} percent`}
        // The look of the video's volume slider (its track and thumb). That
        // class also hides and narrows the slider for a video on a phone;
        // here it is shown, and the circle above decides when it is open.
        className={cn(
          "player-volume-slider block! h-8.5 cursor-pointer accent-(--video-player-control-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)",
          "m-0! w-0! p-0 opacity-0! transition-[width,margin,opacity] duration-200 ease-out",
          expanded && "mr-2! ml-1! w-18! opacity-100!",
        )}
        style={{ "--video-player-volume": `${filled}%` } as CSSProperties}
        onChange={(event) => setScale(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}

/** The row's left end: previous and next, then the text size. */
export function LessonReadingNavigationControls({
  canGoNext,
  canGoPrevious,
  hidden,
  onGoNext,
  onGoPrevious,
  showLessonNavigation,
  style,
}: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  hidden: boolean;
  onGoNext: () => void;
  onGoPrevious: () => void;
  showLessonNavigation: boolean;
  /** The player theme's colours, which a video's own controls are given. */
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        readingControlRowClass,
        "left-3",
        hidden && "invisible opacity-0",
      )}
      aria-hidden={hidden ? true : undefined}
      inert={hidden ? true : undefined}
      style={style}
      data-player-fullscreen-swipe-ignore=""
    >
      {showLessonNavigation && (canGoNext || canGoPrevious) ? (
        <LessonNavigationPill
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          onGoNext={onGoNext}
          onGoPrevious={onGoPrevious}
        />
      ) : null}
      <ReadingFontSizeControl />
    </div>
  );
}

/**
 * The row's right end: the Lessons button, then the full screen button,
 * with the button that turns the screen beside it while full screen.
 */
export function LessonReadingFullscreenControls({
  enterIcon,
  exitIcon,
  hidden = false,
  lessonsButton,
  readingFullscreen,
  style,
}: {
  enterIcon: ReactNode;
  exitIcon: ReactNode;
  /** Opens the course's lessons, as the video's Lessons button does. */
  lessonsButton?: ReactNode;
  /** Put away with the other controls by a tap on the text. */
  hidden?: boolean;
  readingFullscreen: ReturnType<typeof useLessonReadingFullscreen>;
  /** The player theme's colours, as for the previous and next buttons. */
  style?: CSSProperties;
}) {
  const { available, canRotate, enter, exit, fullscreen, rotate } =
    readingFullscreen;
  if (!available && !lessonsButton) return null;
  return (
    <div
      className={cn(
        readingControlRowClass,
        // Left of the lessons panel while it is open beside the reading.
        "right-[calc(var(--lesson-reading-panel-width,0px)+0.5rem)]",
        hidden && "invisible opacity-0",
      )}
      aria-hidden={hidden ? true : undefined}
      inert={hidden ? true : undefined}
      style={style}
      data-player-fullscreen-swipe-ignore=""
    >
      {lessonsButton ? (
        <span
          className="flex transition-opacity duration-200 ease-out [[data-reading-lessons-crowded]_&]:pointer-events-none [[data-reading-lessons-crowded]_&]:opacity-0"
          data-reading-lessons=""
        >
          {lessonsButton}
        </span>
      ) : null}
      {canRotate ? (
        <PlayerCircleIconButton
          cluster="reading-rotate"
          label="Rotate screen"
          icon={<DeviceRotate size={23} weight="bold" />}
          onClick={() => void rotate()}
        />
      ) : null}
      {available ? (
        <PlayerCircleIconButton
          cluster="reading-fullscreen"
          label={fullscreen ? "Exit full screen" : "Full screen"}
          icon={fullscreen ? exitIcon : enterIcon}
          onClick={() => void (fullscreen ? exit() : enter())}
        />
      ) : null}
    </div>
  );
}
