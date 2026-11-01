import { useSyncExternalStore } from "react";
import auroraWallpaper from "../../assets/home/wallpapers/aurora.webp";
import contoursWallpaper from "../../assets/home/wallpapers/contours.webp";
import duskWallpaper from "../../assets/home/wallpapers/dusk.webp";
import silkWallpaper from "../../assets/home/wallpapers/silk.webp";
import sunsetWallpaper from "../../assets/home/wallpapers/sunset.webp";
import {
  isWallpaperAccent,
  readWallpaperAccent,
} from "./laptopWallpaperAccent";

/**
 * The wallpaper on the laptop in the learner's hero. The learner's goal is
 * drawn over it (see `LearnerGoalScreen`), so the screen reads as a laptop
 * that is on rather than a dark panel.
 *
 * The learner chooses it in Settings: one of the wallpapers that come with
 * the app, or a picture of their own. The choice is kept in this browser,
 * as the theme is; it does not follow them to another device. A picture of
 * their own is kept here too, already cut to the screen's shape and size
 * (see `laptopWallpaperImage.ts`).
 *
 * Of the wallpapers that come with the app, Sunset is a picture the
 * project's owner supplied; the others are drawn by
 * `scripts/generate-laptop-wallpapers.mjs`.
 *
 * Each has an accent: the colour the day's progress and the words are drawn
 * in over it, picked to sit with the picture (warm on a sunset, cool on
 * blue). A learner's own picture has its accent taken from it (see
 * `laptopWallpaperAccent`). That is worked out once, the first time the
 * picture is shown, and kept beside it; until it is known, and for a
 * picture with no colour in it, the screen uses the theme's accent.
 */
export const LAPTOP_WALLPAPERS = [
  { id: "sunset", name: "Sunset", src: sunsetWallpaper, accent: "#fdba74" },
  { id: "silk", name: "Silk", src: silkWallpaper, accent: "#93b4ff" },
  {
    id: "contours",
    name: "Contours",
    src: contoursWallpaper,
    accent: "#7dd3fc",
  },
  { id: "dusk", name: "Dusk", src: duskWallpaper, accent: "#fdba74" },
  { id: "aurora", name: "Aurora", src: auroraWallpaper, accent: "#5eead4" },
] as const;

export type LaptopWallpaperPresetId = (typeof LAPTOP_WALLPAPERS)[number]["id"];
/** `own` is the picture the learner supplied. */
export type LaptopWallpaperId = LaptopWallpaperPresetId | "own";

const DEFAULT_WALLPAPER: LaptopWallpaperPresetId = "sunset";

const CHOICE_KEY = "veolms-laptop-wallpaper";
const OWN_IMAGE_KEY = "veolms-laptop-wallpaper-image";
/** The accent taken from the learner's own picture. */
const OWN_ACCENT_KEY = "veolms-laptop-wallpaper-accent";
const CHANGE_EVENT = "veolms-laptop-wallpaper-change";

const isPreset = (value: unknown): value is LaptopWallpaperPresetId =>
  LAPTOP_WALLPAPERS.some((wallpaper) => wallpaper.id === value);

export interface LaptopWallpaperState {
  /** What the laptop shows. */
  id: LaptopWallpaperId;
  src: string;
  /**
   * The colour progress and the words are drawn in over it. None for an own
   * picture whose colour has not been worked out yet, or that has none.
   */
  accent: string | null;
  /** The learner's own picture, whether or not it is the one in use. */
  ownSrc: string | null;
}

const preset = (id: LaptopWallpaperPresetId) =>
  LAPTOP_WALLPAPERS.find((wallpaper) => wallpaper.id === id)!;

const stateOfPreset = (
  id: LaptopWallpaperPresetId,
  ownSrc: string | null,
): LaptopWallpaperState => ({
  id,
  src: preset(id).src,
  accent: preset(id).accent,
  ownSrc,
});

const DEFAULT_STATE = stateOfPreset(DEFAULT_WALLPAPER, null);

function readState(): LaptopWallpaperState {
  try {
    const choice = window.localStorage.getItem(CHOICE_KEY);
    const stored = window.localStorage.getItem(OWN_IMAGE_KEY);
    const ownSrc = stored?.startsWith("data:image/") ? stored : null;
    if (choice === "own" && ownSrc) {
      const accent = window.localStorage.getItem(OWN_ACCENT_KEY);
      return {
        id: "own",
        src: ownSrc,
        accent: isWallpaperAccent(accent) ? accent : null,
        ownSrc,
      };
    }
    return stateOfPreset(isPreset(choice) ? choice : DEFAULT_WALLPAPER, ownSrc);
  } catch {
    return DEFAULT_STATE;
  }
}

// The stored picture is a long string; it is read when something changes,
// not on every render that asks.
let current: LaptopWallpaperState | undefined;

function getState(): LaptopWallpaperState {
  current ??= readState();
  return current;
}

function announce() {
  current = undefined;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * The picture whose accent is being worked out, or was and had none, so it
 * is asked for once and not on every look.
 */
let accentTriedFor: string | undefined;

/**
 * Works out the accent of the learner's own picture if it is the one in use
 * and has none kept: a picture saved before accents were taken, or one just
 * saved. The screen is told when it is known.
 */
function ensureOwnAccent() {
  const state = getState();
  if (state.id !== "own" || state.accent || accentTriedFor === state.src) {
    return;
  }
  const src = state.src;
  accentTriedFor = src;
  void readWallpaperAccent(src).then((accent) => {
    if (!accent) return;
    try {
      // The picture may have been changed or taken off meanwhile.
      if (window.localStorage.getItem(OWN_IMAGE_KEY) !== src) return;
      window.localStorage.setItem(OWN_ACCENT_KEY, accent);
    } catch {
      return;
    }
    announce();
  });
}

function subscribe(onChange: () => void) {
  const refresh = () => {
    current = undefined;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  // Another tab of the same browser.
  window.addEventListener("storage", refresh);
  ensureOwnAccent();
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", refresh);
  };
}

/** The laptop's wallpaper, and the learner's own picture if they gave one. */
export function useLaptopWallpaper(): LaptopWallpaperState {
  return useSyncExternalStore(subscribe, getState, () => DEFAULT_STATE);
}

/** Puts up one of the app's wallpapers, or the learner's own picture. */
export function chooseLaptopWallpaper(id: LaptopWallpaperId) {
  try {
    window.localStorage.setItem(CHOICE_KEY, id);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  announce();
  ensureOwnAccent();
}

/**
 * Keeps a picture of the learner's own (a data URL, already cut to size)
 * and puts it up. Says whether the browser had room for it.
 */
export function saveOwnLaptopWallpaper(dataUrl: string): boolean {
  try {
    window.localStorage.setItem(OWN_IMAGE_KEY, dataUrl);
    window.localStorage.setItem(CHOICE_KEY, "own");
    // The accent kept is the old picture's.
    window.localStorage.removeItem(OWN_ACCENT_KEY);
  } catch {
    return false;
  }
  announce();
  ensureOwnAccent();
  return true;
}

/** Forgets the learner's own picture; the laptop goes back to the default. */
export function removeOwnLaptopWallpaper() {
  try {
    window.localStorage.removeItem(OWN_IMAGE_KEY);
    window.localStorage.removeItem(OWN_ACCENT_KEY);
    if (window.localStorage.getItem(CHOICE_KEY) === "own") {
      window.localStorage.removeItem(CHOICE_KEY);
    }
  } catch {
    // Nothing was kept, so there is nothing to forget.
  }
  announce();
}
