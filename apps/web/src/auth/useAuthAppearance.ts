import { useCallback, useEffect, useState } from "react";
import { academyThemes, persistAcademyTheme } from "../themes.ts";

export type ThemeDisplayMode = "light" | "dark" | "device";

const AUTH_PALETTE = "midnight";

function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readFlag(key: string): boolean {
  return readStoredValue(key) === "true";
}

function readPreviewPalette(): string | null {
  if (typeof window === "undefined" || !import.meta.env.DEV) return null;
  try {
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (
      requested !== null &&
      academyThemes.some((theme) => theme.id === requested)
    ) {
      return requested;
    }
  } catch {
    return null;
  }
  return null;
}

export function useAuthAppearance() {
  const [palette, setPaletteState] = useState<string>(() => {
    return readPreviewPalette() ?? AUTH_PALETTE;
  });

  const [themeMode, setThemeModeState] = useState<ThemeDisplayMode>("dark");

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

  const setPalette = useCallback((nextPalette: string) => {
    setPaletteState(nextPalette);
    persistAcademyTheme(nextPalette);
    document.documentElement.dataset.palette = nextPalette;
  }, []);

  const setThemeMode = useCallback((nextMode: ThemeDisplayMode) => {
    setThemeModeState(nextMode);
    try {
      window.localStorage.setItem("veolms-theme", nextMode);
    } catch {
      // ignore
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolved =
      nextMode === "device" ? (media.matches ? "dark" : "light") : nextMode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.appearance = nextMode;
    setResolvedTheme(resolved);
  }, []);

  const toggleThemeMode = useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setThemeMode(next);
  }, [resolvedTheme, setThemeMode]);

  useEffect(() => {
    const root = document.documentElement;
    const previousPalette = root.dataset.palette;
    const previousTheme = root.dataset.theme;
    const previousAppearance = root.dataset.appearance;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyAppearance = () => {
      const activePalette = readPreviewPalette() ?? AUTH_PALETTE;
      const activeResolved =
        themeMode === "device" ? (media.matches ? "dark" : "light") : themeMode;

      root.dataset.palette = activePalette;
      root.dataset.theme = activeResolved;
      root.dataset.appearance = themeMode;
      root.dataset.reduceAnimations = String(
        readFlag("veolms-reduce-animations"),
      );
      root.dataset.highContrast = String(readFlag("veolms-high-contrast"));
      setResolvedTheme(activeResolved);
    };

    applyAppearance();

    if (themeMode === "device") {
      media.addEventListener("change", applyAppearance);
      return () => {
        media.removeEventListener("change", applyAppearance);
        if (previousPalette === undefined) delete root.dataset.palette;
        else root.dataset.palette = previousPalette;

        if (previousTheme === undefined) delete root.dataset.theme;
        else root.dataset.theme = previousTheme;

        if (previousAppearance === undefined) delete root.dataset.appearance;
        else root.dataset.appearance = previousAppearance;
      };
    }

    return () => {
      if (previousPalette === undefined) delete root.dataset.palette;
      else root.dataset.palette = previousPalette;

      if (previousTheme === undefined) delete root.dataset.theme;
      else root.dataset.theme = previousTheme;

      if (previousAppearance === undefined) delete root.dataset.appearance;
      else root.dataset.appearance = previousAppearance;
    };
  }, [palette, themeMode]);

  return {
    palette,
    setPalette,
    themeMode,
    setThemeMode,
    toggleThemeMode,
    resolvedTheme,
  };
}
