import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AcademyTheme } from "../themes";
import {
  themeRevealOriginFromClick,
  themeRevealOriginFromElement,
} from "./themeViewTransition";
import type { ThemeRevealOrigin } from "./themeViewTransition";

interface AcademyPaletteMenuProps {
  themes: readonly Pick<AcademyTheme, "id" | "name" | "note" | "preview">[];
  selectedTheme: string;
  className?: string;
  id?: string;
  mobile?: boolean;
  onSelect: (themeId: string, origin?: ThemeRevealOrigin) => void;
  // Keyboard previews and cancels carry the focused swatch's center so the
  // reveal emanates from the item keyboard navigation is on.
  onPreview: (themeId: string, origin?: ThemeRevealOrigin) => void;
  onConfirm: (themeId: string) => void;
  onCancel: (origin?: ThemeRevealOrigin) => void;
}

const PALETTE_GRID_COLUMNS = 4;

export function AcademyPaletteMenu({
  themes,
  selectedTheme,
  className = "sidebar-palette-menu",
  id,
  mobile = false,
  onSelect,
  onPreview,
  onConfirm,
  onCancel,
}: AcademyPaletteMenuProps) {
  const [activeTheme, setActiveTheme] = useState(selectedTheme);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (themes.some((theme) => theme.id === selectedTheme)) {
      setActiveTheme(selectedTheme);
    }
  }, [selectedTheme, themes]);

  useEffect(() => {
    const selectedIndex = themes.findIndex(
      (theme) => theme.id === selectedTheme,
    );
    itemRefs.current[Math.max(0, selectedIndex)]?.focus({
      preventScroll: true,
    });
  }, [selectedTheme, themes]);

  const previewThemeAt = (index: number) => {
    const nextTheme = themes[index];
    if (!nextTheme) return;
    setActiveTheme(nextTheme.id);
    // Reveal arrow-key previews from the swatch being navigated to; an
    // unmeasured element (jsdom) yields no origin and the corner applies.
    onPreview(
      nextTheme.id,
      themeRevealOriginFromElement(itemRefs.current[index]) ?? undefined,
    );
    itemRefs.current[index]?.focus({ preventScroll: true });
  };

  const getDirectionalThemeIndex = (
    activeIndex: number,
    key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp",
  ) => {
    if (themes.length === 0) return activeIndex;

    if (key === "ArrowLeft" || key === "ArrowRight") {
      const step = key === "ArrowRight" ? 1 : -1;
      return (activeIndex + step + themes.length) % themes.length;
    }

    const column = activeIndex % PALETTE_GRID_COLUMNS;
    const nextIndex =
      activeIndex +
      (key === "ArrowDown" ? PALETTE_GRID_COLUMNS : -PALETTE_GRID_COLUMNS);
    if (nextIndex >= 0 && nextIndex < themes.length) return nextIndex;

    if (key === "ArrowDown") return column;
    return (
      column +
      Math.floor((themes.length - 1 - column) / PALETTE_GRID_COLUMNS) *
        PALETTE_GRID_COLUMNS
    );
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const activeIndex = Math.max(
      0,
      themes.findIndex((theme) => theme.id === activeTheme),
    );

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowLeft"
    ) {
      event.preventDefault();
      previewThemeAt(getDirectionalThemeIndex(activeIndex, event.key));
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      previewThemeAt(event.key === "Home" ? 0 : themes.length - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onConfirm(activeTheme);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // Reveal the preview revert from the swatch that had focus.
      onCancel(
        themeRevealOriginFromElement(itemRefs.current[activeIndex]) ??
          undefined,
      );
    }
  };

  return (
    <div
      data-palette-menu
      data-mobile-palette-menu={mobile || undefined}
      id={id}
      className={className}
      role="menu"
      aria-label="Choose a color theme"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Escape"
      onKeyDown={handleKeyDown}
    >
      {themes.map((item, index) => (
        <button
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          role="menuitemradio"
          aria-label={`${item.name}. ${item.note}`}
          aria-checked={item.id === activeTheme}
          tabIndex={item.id === activeTheme ? 0 : -1}
          className={item.id === activeTheme ? "is-selected" : ""}
          key={item.id}
          title={item.name}
          data-theme-swatch={item.id}
          style={{ "--theme-swatch": item.preview } as CSSProperties}
          onClick={(event) => {
            setActiveTheme(item.id);
            // Keyboard-activated clicks (Enter/Space) report the viewport
            // origin and yield no reveal origin, so they keep the corner
            // fallback; only real pointer clicks carry coordinates.
            onSelect(item.id, themeRevealOriginFromClick(event) ?? undefined);
          }}
        >
          <i aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
