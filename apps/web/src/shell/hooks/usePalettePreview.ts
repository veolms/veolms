import type { Dispatch, SetStateAction, RefObject } from "react";
import { flushSync } from "react-dom";
import {
  applyWithThemeViewTransition,
  skipActiveThemeViewTransitions,
} from "../themeViewTransition";
import { ensureAcademyPaletteStylesheets } from "../academyPaletteStyles";
import type { ThemeRevealOrigin } from "../themeViewTransition";
import type { ThemePreference, AppearanceOption } from "../academyShellTypes";

export interface UsePalettePreviewArgs {
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  academyTheme: string;
  palettePreviewTheme: string | null;
  setPalettePreviewTheme: Dispatch<SetStateAction<string | null>>;
  displayedAcademyTheme: string;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  paletteMenuSource: "appearance" | "theme";
  setPaletteMenuSource: Dispatch<SetStateAction<"appearance" | "theme">>;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  paletteStyleRequestRef: RefObject<number>;
  revertPalettePreviewRef: RefObject<
    ((origin?: ThemeRevealOrigin) => void) | null
  >;
  activateAppearanceOptionRef: RefObject<
    | ((
        option: AppearanceOption,
        mobile?: boolean,
        source?: "appearance" | "theme",
      ) => void)
    | null
  >;
  appearanceModeTriggerRef: RefObject<HTMLButtonElement | null>;
  paletteTriggerRef: RefObject<HTMLButtonElement | null>;
  mobileAppearanceModeTriggerRef: RefObject<HTMLButtonElement | null>;
  mobilePaletteTriggerRef: RefObject<HTMLButtonElement | null>;
  commitPalette: (nextTheme: string) => void;
  changePalette: (nextTheme: string, origin?: ThemeRevealOrigin) => void;
}

export interface UsePalettePreviewResult {
  previewAcademyTheme: (themeId: string, origin?: ThemeRevealOrigin) => void;
  confirmDesktopPaletteTheme: (themeId: string) => void;
  cancelDesktopPalettePreview: (origin?: ThemeRevealOrigin) => void;
  confirmMobilePaletteTheme: (themeId: string) => void;
  cancelMobilePalettePreview: (origin?: ThemeRevealOrigin) => void;
  activateAppearanceOption: (
    option: AppearanceOption,
    mobile?: boolean,
    source?: "appearance" | "theme",
  ) => void;
}

export function usePalettePreview({
  setTheme,
  academyTheme,
  palettePreviewTheme,
  setPalettePreviewTheme,
  displayedAcademyTheme,
  setPaletteMenu,
  paletteMenuSource,
  setPaletteMenuSource,
  setReadingModeMenu,
  setMobilePaletteMenu,
  paletteStyleRequestRef,
  revertPalettePreviewRef,
  activateAppearanceOptionRef,
  appearanceModeTriggerRef,
  paletteTriggerRef,
  mobileAppearanceModeTriggerRef,
  mobilePaletteTriggerRef,
  commitPalette,
  changePalette,
}: UsePalettePreviewArgs): UsePalettePreviewResult {
  const previewAcademyTheme = (themeId: string, origin?: ThemeRevealOrigin) => {
    const requestId = ++paletteStyleRequestRef.current;
    // No transition when the previewed theme already matches the displayed
    // one; keyboard previews carry the focused swatch's center and pointer
    // previews carry the pointer position as the reveal origin.
    if (themeId === displayedAcademyTheme) {
      setPalettePreviewTheme(themeId);
      return;
    }
    void ensureAcademyPaletteStylesheets(themeId)
      .then(() => {
        if (paletteStyleRequestRef.current !== requestId) return;
        applyWithThemeViewTransition(
          () =>
            flushSync(() => {
              setPalettePreviewTheme(themeId);
              commitPalette(themeId);
            }),
          "palette",
          origin,
        );
      })
      .catch(() => undefined);
  };

  // Reverts an unconfirmed keyboard preview back to the committed theme.
  // Only the revert (previewed theme differing from the committed one)
  // runs a transition; otherwise clearing the preview changes nothing
  // displayed and stays silent. Keyboard Escape carries the focused
  // swatch's center; other dismissals pass nothing for the corner
  // fallback.
  const revertPalettePreview = (origin?: ThemeRevealOrigin) => {
    paletteStyleRequestRef.current += 1;
    if (!palettePreviewTheme || palettePreviewTheme === academyTheme) {
      setPalettePreviewTheme(null);
      return;
    }
    const committedTheme = academyTheme;
    applyWithThemeViewTransition(
      () =>
        flushSync(() => {
          setPalettePreviewTheme(null);
          commitPalette(committedTheme);
        }),
      "palette",
      origin,
    );
  };
  revertPalettePreviewRef.current = revertPalettePreview;

  const focusPaletteTrigger = (trigger: HTMLButtonElement | null) => {
    window.setTimeout(() => trigger?.focus({ preventScroll: true }), 0);
  };

  const confirmDesktopPaletteTheme = (themeId: string) => {
    changePalette(themeId);
    setPaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? appearanceModeTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const cancelDesktopPalettePreview = (origin?: ThemeRevealOrigin) => {
    revertPalettePreview(origin);
    setPaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? appearanceModeTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const confirmMobilePaletteTheme = (themeId: string) => {
    changePalette(themeId);
    setMobilePaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? mobileAppearanceModeTriggerRef.current
        : mobilePaletteTriggerRef.current,
    );
  };

  const cancelMobilePalettePreview = (origin?: ThemeRevealOrigin) => {
    revertPalettePreview(origin);
    setMobilePaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? mobileAppearanceModeTriggerRef.current
        : mobilePaletteTriggerRef.current,
    );
  };

  const activateAppearanceOption = (
    option: AppearanceOption,
    mobile = false,
    source: "appearance" | "theme" = "theme",
  ) => {
    setReadingModeMenu(null);
    if (option === "theme") {
      if (document.documentElement.dataset.themeTransition) {
        skipActiveThemeViewTransitions();
      }
      setPaletteMenuSource(source);
      if (mobile) setMobilePaletteMenu(true);
      else setPaletteMenu(true);
      return;
    }
    setTheme(option);
    revertPalettePreview();
    if (mobile) setMobilePaletteMenu(false);
    else setPaletteMenu(false);
  };
  activateAppearanceOptionRef.current = activateAppearanceOption;
  return {
    previewAcademyTheme,
    confirmDesktopPaletteTheme,
    cancelDesktopPalettePreview,
    confirmMobilePaletteTheme,
    cancelMobilePalettePreview,
    activateAppearanceOption,
  };
}
