import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

import {
  setNativeSystemBarColors,
  useSystemBarsSupported,
  type SystemBarColors,
} from "../native-bridge";
import { fixedLayerAnimations, readSystemBarColors } from "./systemBarColors";
import { readRevealedEdges } from "./themeReveal";

/** Root attributes that change the page's colours: theme, palette, contrast, a running reveal. */
const ROOT_COLOR_ATTRIBUTES = [
  "data-theme",
  "data-palette",
  "data-high-contrast",
  "data-theme-transition",
];

/** Attributes that open or close a dialog, anywhere in the body. */
const DIALOG_ATTRIBUTES = ["inert", "aria-modal", "open"];

/**
 * Frames a dialog or sheet change may take to start its fade or slide (a
 * closing sheet starts its fade-out a few frames after the page behind it
 * stops being inert). Reads wait that long for it, so they follow the fade
 * instead of jumping ahead of it.
 */
const DIALOG_SETTLE_FRAMES = 4;

/** Body attributes the app sets while a dialog is open. */
const BODY_DIALOG_ATTRIBUTES = ["class", "data-modal-open"];

/**
 * Inside an app build that can colour the phone's status and navigation
 * bars: keeps them the colour of the page next to them.
 *
 * 1. Sends once the bridge is ready: at start-up and after every full page
 *    load (a new page starts with the app's own colours, so each page sends
 *    its own).
 * 2. Sends again when the theme, palette or light/dark mode changes (also
 *    the "device" mode following the phone), the route changes, a dialog
 *    opens or closes, a fixed layer such as the bottom tab bar or a sheet
 *    starts or finishes a fade or slide, or a stylesheet arrives.
 * 3. While a fixed layer fades or slides (a sheet opening or closing, a
 *    dialog's backdrop), sends the colours of every frame, so the bars dim
 *    and brighten with the page instead of jumping before or after it. After
 *    a dialog or sheet change, waits a few frames for that fade to start.
 * 4. During a theme reveal, changes each bar as the growing circle uncovers
 *    the screen edge next to it, not when the animation ends (the circle
 *    covers the screen well before that). The colours are read once, when
 *    the reveal starts.
 * 5. The same colours are not sent twice, unless the app failed to take
 *    them: then the next change sends them again.
 *
 * In a browser and in older app builds it does nothing at all. Lives once in
 * the root.
 */
export function SystemBarsSync() {
  const supported = useSystemBarsSupported();
  const { pathname } = useLocation();
  const scheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!supported) return undefined;
    const root = document.documentElement;
    let disposed = false;
    let sent: SystemBarColors | null = null;
    let frame = 0;
    // Frames still to wait for a dialog's fade or slide to start.
    let settleFrames = 0;
    let revealFrame = 0;
    // The colours under a running reveal, read once at its first frame.
    let revealTarget: SystemBarColors | null = null;

    const send = (colors: SystemBarColors) => {
      if (
        sent !== null &&
        sent.statusBar === colors.statusBar &&
        sent.navigationBar === colors.navigationBar
      ) {
        return;
      }
      sent = colors;
      void setNativeSystemBarColors(colors).then((taken) => {
        // Not taken: forget it, so the next change sends it again. Only if
        // nothing newer was sent since; no retry loop of its own.
        if (!taken && sent === colors) sent = null;
      });
    };

    // A theme reveal draws the old page over the new one, uncovering it
    // with a growing circle. The page under it already has the new colours,
    // so each bar takes them when its edge is uncovered. The reveal's end
    // schedules a normal read.
    const followReveal = () => {
      revealFrame = 0;
      if (root.dataset.themeTransition === undefined) {
        revealTarget = null;
        return;
      }
      const edges = readRevealedEdges();
      if (edges) revealTarget ??= readSystemBarColors();
      const next = revealTarget;
      if (edges && next && (edges.top || edges.bottom)) {
        send({
          statusBar: edges.top ? next.statusBar : (sent?.statusBar ?? null),
          navigationBar: edges.bottom
            ? next.navigationBar
            : (sent?.navigationBar ?? null),
        });
        if (edges.top && edges.bottom) {
          revealTarget = null;
          return;
        }
      }
      revealFrame = requestAnimationFrame(followReveal);
    };
    const startFollowingReveal = () => {
      if (!revealFrame) revealFrame = requestAnimationFrame(followReveal);
    };

    const read = () => {
      frame = 0;
      if (root.dataset.themeTransition !== undefined) {
        startFollowingReveal();
        return;
      }
      const moving = fixedLayerAnimations().length > 0;
      if (!moving && settleFrames > 0) {
        settleFrames -= 1;
        frame = requestAnimationFrame(read);
        return;
      }
      settleFrames = 0;
      send(readSystemBarColors(sent));
      // A sheet or backdrop fading or sliding: the bars follow it frame by
      // frame, and the frame after it stops sends the final colours.
      if (moving) {
        frame = requestAnimationFrame(read);
      }
    };
    // The next frame: reads then see the change styled, and a fade that
    // has started is followed from its first frame.
    const schedule = (settle = 0) => {
      settleFrames = Math.max(settleFrames, settle);
      if (frame || disposed) return;
      frame = requestAnimationFrame(read);
    };
    scheduleRef.current = schedule;

    const rootObserver = new MutationObserver(() => {
      // New colours: a reveal under way reads its target again.
      revealTarget = null;
      // A reveal is followed from its first frame, not two frames later.
      if (root.dataset.themeTransition !== undefined) startFollowingReveal();
      else schedule();
    });
    rootObserver.observe(root, {
      attributes: true,
      attributeFilter: ROOT_COLOR_ATTRIBUTES,
    });
    const scheduleForDialog = () => schedule(DIALOG_SETTLE_FRAMES);
    const dialogObserver = new MutationObserver(scheduleForDialog);
    dialogObserver.observe(document.body, {
      attributes: true,
      attributeFilter: DIALOG_ATTRIBUTES,
      subtree: true,
    });
    // Dialogs added to or removed from the body itself, and its flags.
    const bodyObserver = new MutationObserver(scheduleForDialog);
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: BODY_DIALOG_ATTRIBUTES,
      childList: true,
    });
    // A fixed layer that starts or finishes a fade or slide (the tab bar
    // hiding on scroll has no other sign): starting begins the frame-by-
    // frame reads, finishing gives the final colours.
    const onLayerChanged = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        getComputedStyle(target).position === "fixed"
      ) {
        schedule();
      }
    };
    const onStylesheetLoad = (event: Event) => {
      if (event.target instanceof HTMLLinkElement) schedule();
    };
    document.addEventListener("transitionrun", onLayerChanged, true);
    document.addEventListener("animationstart", onLayerChanged, true);
    document.addEventListener("transitionend", onLayerChanged, true);
    document.addEventListener("transitioncancel", onLayerChanged, true);
    document.addEventListener("animationend", onLayerChanged, true);
    document.addEventListener("load", onStylesheetLoad, true);
    schedule();

    return () => {
      disposed = true;
      scheduleRef.current = null;
      if (frame) cancelAnimationFrame(frame);
      if (revealFrame) cancelAnimationFrame(revealFrame);
      rootObserver.disconnect();
      dialogObserver.disconnect();
      bodyObserver.disconnect();
      document.removeEventListener("transitionrun", onLayerChanged, true);
      document.removeEventListener("animationstart", onLayerChanged, true);
      document.removeEventListener("transitionend", onLayerChanged, true);
      document.removeEventListener("transitioncancel", onLayerChanged, true);
      document.removeEventListener("animationend", onLayerChanged, true);
      document.removeEventListener("load", onStylesheetLoad, true);
    };
  }, [supported]);

  // Pages differ in what sits next to the bars (some have no tab bar).
  useEffect(() => {
    scheduleRef.current?.();
  }, [pathname]);

  return null;
}
