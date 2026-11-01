import { useLayoutEffect } from "react";
import type { RefObject } from "react";

/**
 * Whether the browser lays an element out with CSS anchor positioning
 * (`position-anchor`, `anchor()`, `anchor-size()`). Chrome has since 125;
 * Safari only since 26 (September 2025), so an iPhone on iOS 17 or 18 does
 * not, and an element that depends on it there has no place and no size.
 */
export function supportsAnchorPositioning(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return false;
  }
  return (
    CSS.supports("position-anchor: --a") &&
    CSS.supports("top: anchor(top)") &&
    CSS.supports("width: anchor-size(width)")
  );
}

const GEOMETRY_PROPERTIES = ["top", "left", "width", "height"] as const;

/**
 * Places `host` over `anchor` by measuring, where the stylesheet's anchor
 * positioning (learning.css, `.learning-persistent-player--full`) is not
 * understood: the lesson player is laid out this way over its slot in the
 * page, and without this an iPhone before iOS 26 showed no player at all.
 *
 * The host stays `position: absolute` (from the stylesheet) and gets the
 * slot's box as inline `top`/`left`/`width`/`height`, relative to its
 * offset parent, written with `!important` so no class geometry (the
 * minimize motion's calc of `anchor-size()`) takes it away again. It is
 * measured again whenever the slot or its offset parent changes size, and
 * on scroll and resize; in a browser that has anchor positioning it does
 * nothing.
 */
export function useAnchorPositionFallback(
  hostRef: RefObject<HTMLElement | null>,
  anchor: HTMLElement | null,
): void {
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !anchor || supportsAnchorPositioning()) return undefined;

    // What this hook wrote, so that leaving takes away only its own values:
    // the mini player that follows sets its own box on the same element in
    // the same commit, before this cleanup runs, and must keep it.
    const written: Partial<
      Record<(typeof GEOMETRY_PROPERTIES)[number], string>
    > = {};
    const clear = () => {
      for (const property of GEOMETRY_PROPERTIES) {
        if (
          written[property] !== undefined &&
          host.style.getPropertyValue(property) === written[property] &&
          host.style.getPropertyPriority(property) === "important"
        ) {
          host.style.removeProperty(property);
        }
      }
    };
    let frame = 0;
    const place = () => {
      frame = 0;
      if (!host.isConnected || !anchor.isConnected) return;
      const parent = (host.offsetParent as HTMLElement | null) ?? null;
      const anchorRect = anchor.getBoundingClientRect();
      if (anchorRect.width <= 0 && anchorRect.height <= 0) return;
      let top = anchorRect.top;
      let left = anchorRect.left;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        top += parent.scrollTop - parentRect.top - parent.clientTop;
        left += parent.scrollLeft - parentRect.left - parent.clientLeft;
      } else {
        top += window.scrollY;
        left += window.scrollX;
      }
      const next: Record<(typeof GEOMETRY_PROPERTIES)[number], string> = {
        top: `${top}px`,
        left: `${left}px`,
        width: `${anchorRect.width}px`,
        height: `${anchorRect.height}px`,
      };
      for (const property of GEOMETRY_PROPERTIES) {
        if (host.style.getPropertyValue(property) !== next[property]) {
          host.style.setProperty(property, next[property], "important");
        }
        written[property] = next[property];
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };

    place();
    const observer = new ResizeObserver(schedule);
    observer.observe(anchor);
    if (host.offsetParent) observer.observe(host.offsetParent);
    document.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    // Layout settling after fonts, images and late chunks: a few more looks.
    const settle = window.setInterval(schedule, 250);
    const stopSettling = window.setTimeout(
      () => window.clearInterval(settle),
      3000,
    );
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearInterval(settle);
      window.clearTimeout(stopSettling);
      observer.disconnect();
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      clear();
    };
  }, [anchor, hostRef]);
}
