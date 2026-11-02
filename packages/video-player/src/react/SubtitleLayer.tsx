import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePlayerController } from "./context";
import { usePlayerState } from "./usePlayerState";

const LAYOUT_STORAGE_KEY = "veolms-player-subtitle-layout";
/** Held this long without moving, a press on the subtitles picks them up. */
const LONG_PRESS_MS = 400;
/** A press that moves this far before then is not a long press. */
const PRESS_SLOP_PX = 8;
const PICK_UP_VIBRATION_MS = 20;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2;

/**
 * Where the subtitles are and how large, as the viewer has left them: an
 * offset from their usual place as a share of the player's width and height,
 * and a size relative to the usual one.
 */
interface SubtitleLayout {
  x: number;
  y: number;
  scale: number;
}

const DEFAULT_LAYOUT: SubtitleLayout = { x: 0, y: 0, scale: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampLayout(layout: SubtitleLayout): SubtitleLayout {
  return {
    x: clamp(layout.x, -0.45, 0.45),
    // Up to near the top of the picture, and a little lower than usual.
    y: clamp(layout.y, -0.8, 0.04),
    scale: clamp(layout.scale, MIN_SCALE, MAX_SCALE),
  };
}

function readLayout(): SubtitleLayout {
  try {
    const stored = JSON.parse(
      localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "null",
    ) as Partial<SubtitleLayout> | null;
    if (!stored) return DEFAULT_LAYOUT;
    return clampLayout({
      x: Number(stored.x) || 0,
      y: Number(stored.y) || 0,
      scale: Number(stored.scale) || 1,
    });
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function writeLayout(layout: SubtitleLayout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Kept for this visit only.
  }
}

interface Point {
  x: number;
  y: number;
}

/**
 * The layer Shaka draws the subtitles in (see `subtitleLayerFor` in the
 * Shaka engine), over the picture and outside its zoom, so zooming the
 * picture leaves them where and as large as they are.
 *
 * The subtitles are the viewer's to arrange: a long press picks them up and
 * moves them, and a pinch that starts on them resizes them instead of
 * zooming the picture. Both are remembered on the device. A tap on them
 * shows or hides the controls, as a tap on the picture does.
 */
export function SubtitleLayer() {
  const controller = usePlayerController();
  const layerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<SubtitleLayout>(readLayout);
  const layoutRef = useRef(layout);
  // While the controls are up the subtitles stand above them, as YouTube's
  // do, rather than under the control bar.
  const controlsVisible = usePlayerState(({ ui }) => ui.controlsVisible);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    interface Gesture {
      points: Map<number, Point>;
      start: SubtitleLayout;
      startPoint: Point;
      startDistance: number;
      startedAt: number;
      moved: boolean;
      mode: "press" | "move" | "pinch";
      timer: ReturnType<typeof setTimeout>;
    }
    let gesture: Gesture | null = null;
    let swallowClickUntil = 0;

    const isOnSubtitles = (target: EventTarget | null) =>
      target instanceof Element &&
      layer.contains(target) &&
      target.closest(".shaka-text-container") !== null &&
      target !== target.closest(".shaka-text-container");

    const distance = (points: Map<number, Point>) => {
      const [first, second] = [...points.values()];
      return first && second
        ? Math.hypot(second.x - first.x, second.y - first.y)
        : 0;
    };

    const end = () => {
      if (!gesture) return;
      clearTimeout(gesture.timer);
      const tap =
        gesture.mode === "press" &&
        !gesture.moved &&
        Date.now() - gesture.startedAt < LONG_PRESS_MS;
      if (gesture.mode !== "press") writeLayout(layoutRef.current);
      layer.removeAttribute("data-subtitle-gesture");
      gesture = null;
      swallowClickUntil = Date.now() + 400;
      if (tap) {
        controller.setControlsVisible(
          !controller.getSnapshot().ui.controlsVisible,
        );
      }
    };

    // Window, capture phase: ahead of the player's own handlers (the
    // picture's zoom and taps), which never see a touch that is the
    // subtitles'.
    const onPointerDown = (event: PointerEvent) => {
      if (gesture) {
        // A second finger, wherever it lands: the pinch is the subtitles'.
        event.stopPropagation();
        event.preventDefault();
        gesture.points.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (gesture.points.size === 2) {
          clearTimeout(gesture.timer);
          gesture.mode = "pinch";
          gesture.start = layoutRef.current;
          gesture.startDistance = distance(gesture.points);
          layer.setAttribute("data-subtitle-gesture", "pinch");
        }
        return;
      }
      if (!isOnSubtitles(event.target)) return;
      event.stopPropagation();
      const point = { x: event.clientX, y: event.clientY };
      gesture = {
        points: new Map([[event.pointerId, point]]),
        start: layoutRef.current,
        startPoint: point,
        startDistance: 0,
        startedAt: Date.now(),
        moved: false,
        mode: "press",
        timer: setTimeout(() => {
          if (!gesture || gesture.mode !== "press" || gesture.moved) return;
          gesture.mode = "move";
          gesture.start = layoutRef.current;
          layer.setAttribute("data-subtitle-gesture", "move");
          navigator.vibrate?.(PICK_UP_VIBRATION_MS);
        }, LONG_PRESS_MS),
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture?.points.has(event.pointerId)) return;
      event.stopPropagation();
      const point = { x: event.clientX, y: event.clientY };
      gesture.points.set(event.pointerId, point);
      const bounds = layer.getBoundingClientRect();
      if (gesture.mode === "press") {
        if (
          Math.hypot(
            point.x - gesture.startPoint.x,
            point.y - gesture.startPoint.y,
          ) > PRESS_SLOP_PX
        ) {
          gesture.moved = true;
        }
        return;
      }
      event.preventDefault();
      let next = gesture.start;
      if (gesture.mode === "move" && bounds.width > 0 && bounds.height > 0) {
        next = {
          ...gesture.start,
          x: gesture.start.x + (point.x - gesture.startPoint.x) / bounds.width,
          y: gesture.start.y + (point.y - gesture.startPoint.y) / bounds.height,
        };
      } else if (gesture.mode === "pinch" && gesture.startDistance > 0) {
        next = {
          ...gesture.start,
          scale:
            gesture.start.scale *
            (distance(gesture.points) / gesture.startDistance),
        };
      }
      const clamped = clampLayout(next);
      layoutRef.current = clamped;
      setLayout(clamped);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!gesture?.points.has(event.pointerId)) return;
      event.stopPropagation();
      gesture.points.delete(event.pointerId);
      if (gesture.points.size === 0) end();
    };

    // The touch events behind a pointer gesture, and the click a tap ends
    // with, are the subtitles' too.
    const onTouch = (event: TouchEvent) => {
      if (gesture || isOnSubtitles(event.target)) {
        event.stopPropagation();
        if (gesture && gesture.mode !== "press" && event.cancelable) {
          event.preventDefault();
        }
      }
    };
    const onClick = (event: MouseEvent) => {
      if (Date.now() < swallowClickUntil && isOnSubtitles(event.target)) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    const options = { capture: true, passive: false } as const;
    window.addEventListener("pointerdown", onPointerDown, options);
    window.addEventListener("pointermove", onPointerMove, options);
    window.addEventListener("pointerup", onPointerUp, options);
    window.addEventListener("pointercancel", onPointerUp, options);
    window.addEventListener("touchstart", onTouch, options);
    window.addEventListener("touchmove", onTouch, options);
    window.addEventListener("touchend", onTouch, options);
    window.addEventListener("click", onClick, options);
    return () => {
      if (gesture) clearTimeout(gesture.timer);
      window.removeEventListener("pointerdown", onPointerDown, options);
      window.removeEventListener("pointermove", onPointerMove, options);
      window.removeEventListener("pointerup", onPointerUp, options);
      window.removeEventListener("pointercancel", onPointerUp, options);
      window.removeEventListener("touchstart", onTouch, options);
      window.removeEventListener("touchmove", onTouch, options);
      window.removeEventListener("touchend", onTouch, options);
      window.removeEventListener("click", onClick, options);
    };
  }, [controller]);

  return (
    <div
      ref={layerRef}
      aria-live="off"
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      data-video-player-subtitles=""
      data-controls-visible={controlsVisible ? "true" : undefined}
      style={
        {
          "--video-player-subtitle-x": layout.x,
          "--video-player-subtitle-y": layout.y,
          "--video-player-subtitle-scale": layout.scale,
        } as CSSProperties
      }
    />
  );
}
