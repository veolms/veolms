import {
  getPageFullscreenElement,
  PAGE_FULLSCREEN_CHANGE_EVENT,
} from "@veolms/video-player";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getDocumentFullscreenElement } from "../fullscreen";
import {
  applyReadingModePreferences,
  READING_MODE_CHANGE_EVENT,
  READING_MODE_STORAGE_KEY,
  readReadingModePreferences,
} from "./readingModePreferences";

const FULLSCREEN_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  PAGE_FULLSCREEN_CHANGE_EVENT,
];

const subscribeToFullscreen = (onChange: () => void) => {
  for (const type of FULLSCREEN_EVENTS) {
    document.addEventListener(type, onChange);
  }
  return () => {
    for (const type of FULLSCREEN_EVENTS) {
      document.removeEventListener(type, onChange);
    }
  };
};

/**
 * The element on screen in place of the page, if any. A full screen (and the
 * page full screen the player draws itself, a top-layer popover) paints only
 * that element, so layers left over the page never reach it. A video or
 * other replaced element cannot hold the layers; the page's own layers are
 * kept then.
 */
const getFullscreenHost = (): HTMLElement | null => {
  const element = getDocumentFullscreenElement() ?? getPageFullscreenElement();
  if (!(element instanceof HTMLElement)) return null;
  if (
    element instanceof HTMLVideoElement ||
    element instanceof HTMLIFrameElement ||
    element instanceof HTMLImageElement
  ) {
    return null;
  }
  return element;
};
const getServerFullscreenHost = () => null;

export function ReadingModeEffects() {
  const fullscreenHost = useSyncExternalStore(
    subscribeToFullscreen,
    getFullscreenHost,
    getServerFullscreenHost,
  );

  useEffect(() => {
    const refresh = () =>
      applyReadingModePreferences(readReadingModePreferences());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === READING_MODE_STORAGE_KEY || event.key === null) {
        refresh();
      }
    };

    refresh();
    let resizeFrame: number | null = null;
    const scheduleRefresh = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        refresh();
      });
    };
    window.addEventListener(READING_MODE_CHANGE_EVENT, refresh);
    window.addEventListener("resize", scheduleRefresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener(READING_MODE_CHANGE_EVENT, refresh);
      window.removeEventListener("resize", scheduleRefresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const layers = (
    <>
      <div
        className="reading-mode-effects reading-mode-effects__texture"
        data-reading-mode-effects
        aria-hidden="true"
      />
      <div
        className="reading-mode-effects reading-mode-effects__temperature"
        aria-hidden="true"
      />
      <div
        className="reading-mode-effects reading-mode-effects__colors"
        aria-hidden="true"
      />
    </>
  );

  // Inside the full-screen element the layers share its stacking context, so
  // they blend with the video exactly as they blend with the page.
  return fullscreenHost ? createPortal(layers, fullscreenHost) : layers;
}
