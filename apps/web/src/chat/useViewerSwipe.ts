import { useEffect, useRef, type RefObject } from "react";

/** A move shorter than this is a tap (or a wobble), never a swipe. */
const START_PX = 12;
/** Let go past this share of the width, the next file opens… */
const COMMIT_SHARE = 0.22;
/** …or after a quick flick, whatever its length (px per ms). */
const FLICK_SPEED = 0.45;
/** Past the first or last file the content only gives a little. */
const EDGE_RESISTANCE = 0.25;
const SETTLE_MS = 180;

/**
 * Where a press must not start a swipe: the video's seek bar and buttons,
 * links, menus and fields (they drag or scroll on their own).
 */
const NOT_A_SWIPE =
  'button, a, input, textarea, select, [role="slider"], [role="menu"], [data-player-control], [data-no-viewer-swipe]';

/**
 * Swiping left or right between the media viewer's files with a finger, as
 * WhatsApp does: the file follows the finger, and once let go it either
 * goes on to the next one or springs back. Touch only (a mouse has the
 * arrows and the keys). Two fingers are a pinch, and a zoomed photo pans:
 * neither is a swipe (`isZoomed`). A vertical move is left to the page (a
 * document scrolls). The click that ends a swipe does not reach the viewer
 * (it would close it).
 *
 * `stage` takes the gestures; `slide` is the element moved.
 */
export function useViewerSwipe(
  stage: RefObject<HTMLElement | null>,
  slide: RefObject<HTMLElement | null>,
  options: {
    canPrevious: boolean;
    canNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    isZoomed: () => boolean;
  },
) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const area = stage.current;
    // The moved element stays the same while the viewer is open.
    const moved = slide.current;
    if (!area) return;
    let pointers = 0;
    let press: {
      id: number;
      x: number;
      y: number;
      at: number;
      swiping: boolean;
      dx: number;
    } | null = null;
    let swallowClick = false;
    let settleTimer = 0;

    const move = (dx: number, animate: boolean) => {
      const element = slide.current;
      if (!element) return;
      element.style.transition = animate
        ? `transform ${SETTLE_MS}ms ease-out`
        : "none";
      element.style.transform = dx === 0 ? "" : `translate3d(${dx}px, 0, 0)`;
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers += 1;
      if (pointers > 1) {
        // A second finger: a pinch, not a swipe.
        if (press?.swiping) move(0, true);
        press = null;
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest(NOT_A_SWIPE);
      // The video's picture is one big button (tap: controls, double tap:
      // seek); a swipe across it still moves between files, as in WhatsApp.
      if (control && !control.hasAttribute("data-player-zoom-surface")) return;
      if (latest.current.isZoomed()) return;
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
        swiping: false,
        dx: 0,
      };
    };

    const onMove = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!press.swiping) {
        if (Math.abs(dx) < START_PX || Math.abs(dx) < Math.abs(dy) * 1.2) {
          // Mostly up or down: not ours (a document scrolls).
          if (Math.abs(dy) > START_PX) press = null;
          return;
        }
        if (latest.current.isZoomed()) {
          press = null;
          return;
        }
        press.swiping = true;
        try {
          area.setPointerCapture(event.pointerId);
        } catch {
          // The pointer is already gone.
        }
      }
      const { canPrevious, canNext } = latest.current;
      const blocked = (dx > 0 && !canPrevious) || (dx < 0 && !canNext);
      press.dx = blocked ? dx * EDGE_RESISTANCE : dx;
      move(press.dx, false);
    };

    const finish = (event: PointerEvent, cancelled: boolean) => {
      if (event.pointerType === "touch") pointers = Math.max(0, pointers - 1);
      if (!press || event.pointerId !== press.id) return;
      const ended = press;
      press = null;
      if (!ended.swiping) return;
      swallowClick = true;
      const width = area.clientWidth || window.innerWidth;
      const speed = Math.abs(ended.dx) / (performance.now() - ended.at || 1);
      const far =
        Math.abs(ended.dx) > width * COMMIT_SHARE || speed > FLICK_SPEED;
      const { canPrevious, canNext, onPrevious, onNext } = latest.current;
      const go =
        cancelled || !far
          ? null
          : ended.dx < 0 && canNext
            ? onNext
            : ended.dx > 0 && canPrevious
              ? onPrevious
              : null;
      if (!go) {
        move(0, true);
        return;
      }
      // Out the side it was pushed, then the next file comes in from the
      // other side.
      const out = ended.dx < 0 ? -width : width;
      move(out, true);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        go();
        move(-out * 0.35, false);
        requestAnimationFrame(() => move(0, true));
      }, SETTLE_MS);
    };
    const onUp = (event: PointerEvent) => finish(event, false);
    const onCancel = (event: PointerEvent) => finish(event, true);

    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    };
    // A touch with no click after it (a swipe that ended off the screen)
    // must not swallow the next real tap.
    const onTouchStart = () => {
      swallowClick = false;
    };

    area.addEventListener("pointerdown", onDown);
    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerup", onUp);
    area.addEventListener("pointercancel", onCancel);
    area.addEventListener("click", onClick, true);
    area.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => {
      window.clearTimeout(settleTimer);
      area.removeEventListener("pointerdown", onDown);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerup", onUp);
      area.removeEventListener("pointercancel", onCancel);
      area.removeEventListener("click", onClick, true);
      area.removeEventListener("touchstart", onTouchStart);
      if (moved) {
        moved.style.transform = "";
        moved.style.transition = "";
      }
    };
  }, [slide, stage]);
}
