import {
  MuteButton,
  usePlayerController,
  usePlayerState,
  useVolume,
} from "@veolms/video-player";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { cn } from "../../lib/utils";

/** How long the open pill waits, untouched, before it closes. */
const VOLUME_PILL_OPEN_MS = 3_000;

/** The player's picture: a tap on it shows or hides the controls. */
const PLAYER_PICTURE_SELECTOR = "[data-player-zoom-surface]";

/**
 * The events a tap is made of, in the order a phone sends them. Once the
 * press that closed the pill is over, the next tap is the picture's again.
 */
const TAP_EVENTS = [
  "pointerdown",
  "touchstart",
  "pointerup",
  "pointercancel",
  "touchend",
  "touchcancel",
  "mousedown",
  "mouseup",
  "click",
] as const;
/** How long after the press ends its late mouse events may still come. */
const TAP_TAIL_MS = 400;

/**
 * Keeps the rest of a tap on the player's picture from reaching it: the
 * tap closed the pill, and is not also the picture's tap that hides the
 * controls. Listened for on the window, before anything on the page.
 */
function swallowTapOnPicture() {
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    for (const type of TAP_EVENTS) {
      window.removeEventListener(type, swallow, true);
    }
    if (tailTimer !== null) clearTimeout(tailTimer);
  };
  function swallow(event: Event) {
    if (
      event.target instanceof Element &&
      event.target.closest(PLAYER_PICTURE_SELECTOR)
    ) {
      event.stopPropagation();
    }
    if (event.type === "click") {
      stop();
      return;
    }
    if (
      event.type === "pointerup" ||
      event.type === "pointercancel" ||
      event.type === "touchend" ||
      event.type === "touchcancel"
    ) {
      if (tailTimer !== null) clearTimeout(tailTimer);
      tailTimer = setTimeout(stop, TAP_TAIL_MS);
    }
  }
  for (const type of TAP_EVENTS) {
    window.addEventListener(type, swallow, true);
  }
}

/**
 * Whether this browser lets a page set a video's volume. Safari on an
 * iPhone or iPad does not (the volume is the device's, and only muting
 * works), so there the speaker keeps muting at a tap.
 */
let volumeAdjustable: boolean | undefined;
function canAdjustVolume(): boolean {
  if (volumeAdjustable !== undefined) return volumeAdjustable;
  try {
    const probe = document.createElement("video");
    probe.volume = 0.5;
    volumeAdjustable = probe.volume === 0.5;
  } catch {
    volumeAdjustable = true;
  }
  return volumeAdjustable;
}

/**
 * The phone layout's volume: a speaker that, tapped, opens into a pill with
 * a volume slider beside it. It is the first of the controls in the top
 * right corner, so the pill grows to the left and carries the speaker with
 * it. While it is open the controls stay up, and the speaker inside it
 * mutes and unmutes; left alone for a few seconds, or once the controls are
 * hidden, it closes again.
 */
export function LessonVolumePill({
  buttonClassName,
}: {
  buttonClassName: string;
}) {
  const controller = usePlayerController();
  const { muted, volume } = useVolume();
  const controlsVisible = usePlayerState(({ ui }) => ui.controlsVisible);
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = muted ? 0 : volume;

  const close = useCallback(() => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setOpen(false);
  }, []);

  /** Opens the pill, or keeps it open for a while longer. */
  const keepOpen = useCallback(() => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    setOpen(true);
    closeTimerRef.current = setTimeout(close, VOLUME_PILL_OPEN_MS);
  }, [close]);

  // The controls stay up while the pill is open; it closes with them.
  useEffect(() => {
    controller.setControlsLocked(open);
    return () => controller.setControlsLocked(false);
  }, [controller, open]);
  useEffect(() => {
    if (!controlsVisible) close();
  }, [close, controlsVisible]);
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    },
    [],
  );
  // A tap anywhere outside the open pill closes it, and only it: on the
  // picture, that tap does not also hide the controls (the next one does).
  // A tap on another control still does what that control does.
  const pillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      const target = event.target;
      if (target instanceof Node && pillRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest(PLAYER_PICTURE_SELECTOR)
      ) {
        swallowTapOnPicture();
        event.stopPropagation();
      }
      close();
    };
    window.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () =>
      window.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [close, open]);

  if (!canAdjustVolume()) {
    return <MuteButton className={buttonClassName} iconSize={22} />;
  }

  return (
    <div
      ref={pillRef}
      className={cn(
        "flex h-8 items-center rounded-full transition-[background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        open &&
          "bg-(--video-player-control-surface) shadow-(--video-player-control-shadow)",
      )}
      data-volume-pill={open ? "open" : "closed"}
      // Gestures on the player (swipes) leave its controls alone.
      data-player-control=""
    >
      <MuteButton
        className={buttonClassName}
        iconSize={22}
        label={open ? undefined : "Volume"}
        onPress={
          open
            ? () => {
                controller.toggleMuted();
                keepOpen();
              }
            : keepOpen
        }
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={shown}
        aria-label="Volume"
        aria-valuetext={`${Math.round(shown * 100)} percent`}
        aria-hidden={open ? undefined : true}
        tabIndex={open ? undefined : -1}
        className={cn(
          // Marked important: the player's stylesheets hide their volume
          // sliders on a narrow screen and keep them closed outside a
          // hovered volume group.
          "player-volume-slider !block h-8 cursor-pointer touch-none p-0 transition-[width,margin,opacity] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)",
          open
            ? "!mr-3 !ml-0.5 !w-20 !opacity-100"
            : "pointer-events-none m-0 w-0 opacity-0",
        )}
        style={{ "--video-player-volume": `${shown * 100}%` } as CSSProperties}
        onPointerDown={keepOpen}
        onChange={(event) => {
          controller.setVolume(event.currentTarget.valueAsNumber);
          controller.showVolume(event.currentTarget.valueAsNumber);
          keepOpen();
        }}
      />
    </div>
  );
}
