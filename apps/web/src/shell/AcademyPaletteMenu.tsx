import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check } from "@phosphor-icons/react";
import type { AcademyTheme } from "../themes";

interface AcademyPaletteMenuProps {
  themes: readonly Pick<AcademyTheme, "id" | "name" | "note" | "preview">[];
  selectedTheme: string;
  className?: string;
  id?: string;
  mobile?: boolean;
  onSelect: (themeId: string) => void;
  onPreview: (themeId: string) => void;
  onConfirm: (themeId: string) => void;
  onCancel: () => void;
}

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
    onPreview(nextTheme.id);
    itemRefs.current[index]?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const activeIndex = Math.max(
      0,
      themes.findIndex((theme) => theme.id === activeTheme),
    );

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      previewThemeAt((activeIndex + direction + themes.length) % themes.length);
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
      onCancel();
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
      aria-keyshortcuts="ArrowUp ArrowDown Home End Enter Escape"
      onKeyDown={handleKeyDown}
    >
      <div>
        <strong>Color theme</strong>
      </div>
      {themes.map((item, index) => (
        <button
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          role="menuitemradio"
          aria-checked={item.id === activeTheme}
          tabIndex={item.id === activeTheme ? 0 : -1}
          className={item.id === activeTheme ? "is-selected" : ""}
          key={item.id}
          onClick={() => {
            setActiveTheme(item.id);
            onSelect(item.id);
          }}
        >
          <i style={{ background: item.preview }} />
          <span>
            <strong>{item.name}</strong>
            <small>{item.note}</small>
          </span>
          {item.id === activeTheme && <Check size={16} weight="bold" />}
        </button>
      ))}
    </div>
  );
}
