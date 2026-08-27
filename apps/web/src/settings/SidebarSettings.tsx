import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CircleHalfIcon as CircleHalf } from "@phosphor-icons/react/CircleHalf";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react/DotsSixVertical";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { KeyboardIcon as Keyboard } from "@phosphor-icons/react/Keyboard";
import { MoonIcon as Moon } from "@phosphor-icons/react/Moon";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { SidebarSimpleIcon as SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { StackIcon as Stack } from "@phosphor-icons/react/Stack";
import { TextTIcon as TextT } from "@phosphor-icons/react/TextT";
import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { AppSlider } from "../AppSlider";
import { academyThemes } from "../themes";
import type { AcademyTheme } from "../themes";
import { useShortcutPlatform } from "../useShortcutPlatform";
import {
  ChoiceCard,
  RadioGroup,
  SettingRow,
  SettingsToggle,
} from "./SettingsControls";
import { MiniSurface, SidebarIconPreview } from "./SettingsPreviews";
import {
  normalizeSidebarMaxWidth,
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  normalizeSidebarGlow,
  normalizeSidebarGlowBlur,
  normalizeSidebarGlowShape,
  normalizeSidebarGlowShapeSize,
  normalizeSidebarGlowIntensity,
  SIDEBAR_GLOW_BLUR_MAX,
  SIDEBAR_GLOW_BLUR_MIN,
  SIDEBAR_GLOW_BLUR_DEFAULT,
  SIDEBAR_GLOW_DEFAULT,
  SIDEBAR_GLOW_INTENSITY_MAX,
  SIDEBAR_GLOW_INTENSITY_MIN,
  SIDEBAR_GLOW_INTENSITY_DEFAULT,
  SIDEBAR_GLOW_SHAPE_DEFAULT,
  SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT,
  SIDEBAR_GLOW_SHAPE_SIZE_MAX,
  SIDEBAR_GLOW_SHAPE_SIZE_MIN,
  SIDEBAR_MAX_WIDTH_LIMIT,
  SIDEBAR_MAX_WIDTH_MIN,
} from "./settingsPreferences";
import type {
  SidebarDockItem,
  SidebarGlow,
  SidebarGlowShape,
  SidebarMode,
  SidebarPreferences,
} from "./settingsPreferences";
import {
  getDefaultNavigationVisibility,
  getNavigationItems,
} from "../shell/navigation";
import type { ProfileRole } from "./profilePreferences";

// Keep Settings in lockstep with the sidebar and mobile palette menus. This is
// deliberately the shared registry rather than a display-only subset.
const COLOR_THEMES = academyThemes;

interface SidebarIconColor {
  id: string;
  label: string;
  color: string;
}

const SIDEBAR_ICON_COLORS: readonly SidebarIconColor[] = [
  { id: "indigo", label: "Indigo", color: "#6366f1" },
  { id: "blue", label: "Blue", color: "#1683e3" },
  { id: "green", label: "Green", color: "#2fb665" },
  { id: "red", label: "Red", color: "#cc3364" },
  { id: "orange", label: "Orange", color: "#ed8c00" },
  { id: "cyan", label: "Cyan", color: "#1bb4c7" },
];

interface SidebarGlowOption {
  id: SidebarGlow;
  label: string;
  colors?: readonly [string, string];
}

const SIDEBAR_GLOW_OPTIONS: readonly SidebarGlowOption[] = [
  {
    id: "theme",
    label: "Follow theme",
    colors: ["var(--accent)", "var(--accent-hover)"],
  },
  {
    id: "blue-yellow",
    label: "Blue + yellow",
    colors: ["#2397ff", "#ffc724"],
  },
  {
    id: "green-cyan",
    label: "Green + cyan",
    colors: ["#35d77d", "#2bc8e8"],
  },
  {
    id: "red-orange",
    label: "Red + orange",
    colors: ["#ff5069", "#ff9f32"],
  },
  {
    id: "purple-blue",
    label: "Purple + blue",
    colors: ["#9a6cff", "#4d8fff"],
  },
  {
    id: "magenta-rose",
    label: "Magenta + rose",
    colors: ["#f052d4", "#ff718f"],
  },
  {
    id: "off",
    label: "Off",
  },
];

const SIDEBAR_GLOW_SHAPE_OPTIONS: readonly {
  id: SidebarGlowShape;
  label: string;
}[] = [
  { id: "circle", label: "Circle" },
  { id: "triangle", label: "Triangle" },
  { id: "star", label: "Star" },
  { id: "diamond", label: "Diamond" },
  { id: "hexagon", label: "Hexagon" },
];

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const SIDEBAR_DOCK_OPTIONS = [
  {
    id: "appearance",
    label: "Light / dark mode",
    note: "Switch between the light and dark display modes",
    icon: Moon,
  },
  {
    id: "theme",
    label: "Color theme",
    note: "Open the academy color theme picker",
    icon: Palette,
  },
  {
    id: "reading-mode",
    label: "Reading mode",
    note: "Apply or remove the configured paper-like reading mode",
    icon: Eye,
  },
  {
    id: "fullscreen",
    label: "Fullscreen",
    note: "Enter or exit browser fullscreen mode",
    icon: CornersOut,
  },
  {
    id: "settings",
    label: "Settings",
    note: "Open settings from the dock instead of the navigation menu",
    icon: GearSix,
  },
] as const satisfies readonly {
  id: SidebarDockItem;
  label: string;
  note: string;
  icon: typeof Moon;
}[];

type DockDropPosition = "before" | "after";

interface DockDragState {
  pointerId: number;
  item: SidebarDockItem;
  startX: number;
  startY: number;
  dragging: boolean;
}

interface DockDropTarget {
  item: SidebarDockItem;
  position: DockDropPosition;
}

export interface SidebarSettingsProps {
  sidebarPreferences?: SidebarPreferences;
  onSidebarPreferencesChange?: (preferences: SidebarPreferences) => void;
  academyTheme: AcademyTheme["id"];
  sidebarMode: SidebarMode;
  onSidebarModeChange?: (mode: SidebarMode) => void;
  role?: ProfileRole;
  navigationVisibleItems?: readonly string[];
  onNavigationVisibilityChange?: (visibleItems: string[]) => void;
}

export function SidebarSettings({
  sidebarPreferences,
  onSidebarPreferencesChange,
  academyTheme,
  sidebarMode,
  onSidebarModeChange,
  role = "student",
  navigationVisibleItems,
  onNavigationVisibilityChange,
}: SidebarSettingsProps) {
  const preferences = sidebarPreferences || {};
  const iconStyle = preferences.iconStyle || "monochrome";
  const colorMode = preferences.monochromeMode || "theme";
  const customColor = HEX_COLOR_PATTERN.test(preferences.monochromeColor || "")
    ? (preferences.monochromeColor ?? "#6366f1")
    : "#6366f1";
  const themeColor =
    COLOR_THEMES.find((item) => item.id === academyTheme)?.preview || "#6366f1";
  const displayColor =
    colorMode === "theme"
      ? themeColor
      : colorMode === "neutral"
        ? "#9eacc0"
        : customColor;
  const layout = preferences.contentLayout || "framed";
  const sidebarMaxWidth = normalizeSidebarMaxWidth(preferences.sidebarMaxWidth);
  const headerLayout =
    preferences.headerLayout === "fixed" ? "fixed" : "inline";
  const dockItems = normalizeSidebarDockItems(preferences.dockItems);
  const dockOrder = normalizeSidebarDockOrder(preferences.dockOrder);
  const orderedDockOptions = dockOrder.map((item) =>
    SIDEBAR_DOCK_OPTIONS.find((option) => option.id === item)!,
  );
  const showKeyboardShortcuts = preferences.showKeyboardShortcuts !== false;
  const showLabels = preferences.showCollapsedLabels !== false;
  const showCollapsedLogo = preferences.showCollapsedLogo !== false;
  const highlightActive = preferences.highlightActive !== false;
  const elevateMenus = preferences.elevateMenus !== false;
  const glowPalette = normalizeSidebarGlow(preferences.glowPalette);
  const glowShape = normalizeSidebarGlowShape(preferences.glowShape);
  const glowShapeSize = normalizeSidebarGlowShapeSize(
    preferences.glowShapeSize,
  );
  const glowBlur = normalizeSidebarGlowBlur(preferences.glowBlur);
  const glowIntensity = normalizeSidebarGlowIntensity(
    preferences.glowIntensity,
  );
  const navigationItems = getNavigationItems(role);
  const visibleNavigationItems = new Set(
    navigationVisibleItems ?? getDefaultNavigationVisibility(role),
  );
  const glowIsDefault =
    glowPalette === SIDEBAR_GLOW_DEFAULT &&
    glowShape === SIDEBAR_GLOW_SHAPE_DEFAULT &&
    glowShapeSize === SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT &&
    glowBlur === SIDEBAR_GLOW_BLUR_DEFAULT &&
    glowIntensity === SIDEBAR_GLOW_INTENSITY_DEFAULT;
  const shortcutPlatform = useShortcutPlatform();
  const sidebarHidden = sidebarMode === "hidden";
  const [colorDraft, setColorDraft] = useState(displayColor);
  const [sidebarWidthDraft, setSidebarWidthDraft] = useState(
    String(sidebarMaxWidth),
  );
  const [draggedDockItem, setDraggedDockItem] =
    useState<SidebarDockItem | null>(null);
  const [dockDropTarget, setDockDropTarget] = useState<DockDropTarget | null>(
    null,
  );
  const [dockAnnouncement, setDockAnnouncement] = useState("");
  const dockDragRef = useRef<DockDragState | null>(null);
  const dockDropRef = useRef<DockDropTarget | null>(null);
  const selectedPreset =
    SIDEBAR_ICON_COLORS.find(
      (item) => item.color.toLowerCase() === displayColor.toLowerCase(),
    )?.id || (colorMode === "theme" ? "indigo" : "custom");
  const update = (next: SidebarPreferences) =>
    onSidebarPreferencesChange?.({ ...preferences, ...next });

  useEffect(() => {
    setColorDraft(displayColor);
  }, [displayColor]);

  useEffect(() => {
    setSidebarWidthDraft(String(sidebarMaxWidth));
  }, [sidebarMaxWidth]);

  const commitColorDraft = () => {
    if (!HEX_COLOR_PATTERN.test(colorDraft)) return;
    update({
      monochromeMode: "custom",
      monochromeColor: colorDraft,
    });
  };

  const commitSidebarWidthDraft = () => {
    const normalizedWidth = normalizeSidebarMaxWidth(sidebarWidthDraft);
    setSidebarWidthDraft(String(normalizedWidth));
    update({ sidebarMaxWidth: normalizedWidth });
  };

  const toggleDockItem = (item: SidebarDockItem, selected: boolean) => {
    if (selected) {
      update({ dockItems: dockItems.filter((current) => current !== item) });
      return;
    }
    update({ dockItems: [...dockItems, item] });
  };

  const toggleNavigationItem = (label: string, selected: boolean) => {
    const current = navigationItems
      .map(([currentLabel]) => currentLabel)
      .filter((currentLabel) => visibleNavigationItems.has(currentLabel));
    const next = selected
      ? current.filter((currentLabel) => currentLabel !== label)
      : [...current, label];
    onNavigationVisibilityChange?.(next);
  };

  const reorderDockItem = (
    sourceItem: SidebarDockItem,
    targetItem: SidebarDockItem,
    position: DockDropPosition,
  ) => {
    if (sourceItem === targetItem) return;
    const nextOrder = dockOrder.filter((item) => item !== sourceItem);
    const targetIndex = nextOrder.indexOf(targetItem);
    if (targetIndex < 0) return;
    nextOrder.splice(
      targetIndex + (position === "after" ? 1 : 0),
      0,
      sourceItem,
    );
    const nextPreferences: SidebarPreferences = { dockOrder: nextOrder };
    if (!dockItems.includes(sourceItem)) {
      nextPreferences.dockItems = [...dockItems, sourceItem];
    }
    update(nextPreferences);
  };

  const moveDockItemWithKeyboard = (
    item: SidebarDockItem,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const currentIndex = dockOrder.indexOf(item);
    if (currentIndex < 0) return;
    const targetIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? dockOrder.length - 1
          : currentIndex + (event.key === "ArrowUp" ? -1 : 1);
    if (
      targetIndex < 0 ||
      targetIndex >= dockOrder.length ||
      targetIndex === currentIndex
    )
      return;
    event.preventDefault();
    const nextOrder = [...dockOrder];
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, item);
    update({ dockOrder: nextOrder });
    const label = SIDEBAR_DOCK_OPTIONS.find(
      (option) => option.id === item,
    )?.label;
    setDockAnnouncement(`${label} moved to position ${targetIndex + 1}.`);
  };

  const startDockPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: SidebarDockItem,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dockDragRef.current = {
      pointerId: event.pointerId,
      item,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    dockDropRef.current = null;
    setDockDropTarget(null);
  };

  const moveDockPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7
      )
        return;
      drag.dragging = true;
      setDraggedDockItem(drag.item);
    }
    event.preventDefault();
    const targetRow = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-dock-item]");
    if (!targetRow) {
      dockDropRef.current = null;
      setDockDropTarget(null);
      return;
    }
    const targetItem = targetRow?.dataset.dockItem as
      SidebarDockItem | undefined;
    if (!targetItem || targetItem === drag.item) {
      dockDropRef.current = null;
      setDockDropTarget(null);
      return;
    }
    const targetRect = targetRow.getBoundingClientRect();
    const position: DockDropPosition =
      event.clientY >= targetRect.top + targetRect.height / 2
        ? "after"
        : "before";
    const nextTarget = { item: targetItem, position };
    dockDropRef.current = nextTarget;
    setDockDropTarget((current) =>
      current?.item === targetItem && current.position === position
        ? current
        : nextTarget,
    );
  };

  const finishDockPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dockDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (drag.dragging && !cancelled && dockDropRef.current) {
      reorderDockItem(
        drag.item,
        dockDropRef.current.item,
        dockDropRef.current.position,
      );
      setDockAnnouncement("Sidebar dock order saved.");
    }
    dockDropRef.current = null;
    setDraggedDockItem(null);
    setDockDropTarget(null);
  };

  return (
    <div className="settings-content settings-sidebar-settings">
      <div className="settings-sidebar-category-heading">
        <span aria-hidden="true">
          <SidebarSimple size={21} weight="duotone" />
        </span>
        <div>
          <h2>Sidebar header</h2>
          <p>Control how the brand and collapse action share the header.</p>
        </div>
      </div>

      <section className="settings-section settings-sidebar-header-section">
        <div className="settings-section__heading-row">
          <div>
            <h2>Header behavior</h2>
            <p>
              Choose which header item stays anchored while the sidebar resizes.
            </p>
          </div>
        </div>
        <div className="settings-row-list settings-sidebar-header-options__rows">
          <SettingRow
            icon={SidebarSimple}
            label="Fixed collapse control"
            note="Keep the collapse control on the menu icon axis while the logo moves and clips"
          >
            <SettingsToggle
              checked={headerLayout === "fixed"}
              onChange={(value) =>
                update({ headerLayout: value ? "fixed" : "inline" })
              }
              label="Fixed collapse control"
            />
          </SettingRow>
          <SettingRow
            icon={SidebarSimple}
            label="Show logo when collapsed"
            note="Keep the ProCodrr P visible in the compact rail"
          >
            <SettingsToggle
              checked={showCollapsedLogo}
              onChange={(value) => update({ showCollapsedLogo: value })}
              label="Show logo when collapsed"
            />
          </SettingRow>
        </div>
      </section>

      <div className="settings-sidebar-category-heading">
        <span aria-hidden="true">
          <TextT size={21} weight="regular" />
        </span>
        <div>
          <h2>Sidebar menus</h2>
          <p>
            Customize the middle navigation area, its icons, labels, and layout.
          </p>
        </div>
      </div>

      <>
        <section className="settings-section settings-sidebar-navigation-section">
          <div className="settings-section__heading-row">
            <div>
              <h2>Menu items</h2>
              <p>
                Choose which menu items appear in the sidebar. More items can be
                added here later.
              </p>
            </div>
            <output className="settings-section__count" aria-live="polite">
              {
                navigationItems.filter(([label]) =>
                  visibleNavigationItems.has(label),
                ).length
              }{" "}
              visible
            </output>
          </div>
          <div
            className="settings-row-list"
            aria-label={`${role === "creator" ? "Creator" : "Student"} sidebar menu items`}
          >
            {navigationItems.map(([label, Icon]) => {
              const selected = visibleNavigationItems.has(label);
              return (
                <SettingRow
                  key={label}
                  icon={Icon}
                  label={label}
                  note={
                    label === "Settings"
                      ? "Show Settings in the menu when it is not placed in the dock"
                      : `Show ${label} in the sidebar menu`
                  }
                >
                  <SettingsToggle
                    checked={selected}
                    onChange={() => toggleNavigationItem(label, selected)}
                    label={`Show ${label} in sidebar menu`}
                  />
                </SettingRow>
              );
            })}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading-row">
            <div>
              <h2>Icon style</h2>
              <p>Choose how icons are displayed in the sidebar.</p>
            </div>
          </div>
          <RadioGroup
            label="Sidebar icon style"
            className="settings-choice-grid settings-choice-grid--two settings-choice-grid--sidebar-style-options"
          >
            <ChoiceCard
              checked={iconStyle === "multicolor"}
              onChange={() => update({ iconStyle: "multicolor" })}
              label="Multicolor"
              note="Each icon is displayed with its own color"
              className="settings-choice-card--horizontal settings-choice-card--sidebar-style"
              preview={<SidebarIconPreview />}
            />
            <ChoiceCard
              checked={iconStyle === "monochrome"}
              onChange={() => update({ iconStyle: "monochrome" })}
              label="Monochrome"
              note="All icons use a single color"
              className="settings-choice-card--horizontal settings-choice-card--sidebar-style"
              preview={
                <SidebarIconPreview monochrome monoColor={displayColor} />
              }
            />
          </RadioGroup>
        </section>

        <section className="settings-section">
          <div className="settings-section__heading-row">
            <div>
              <h2>Icon color</h2>
              <p>
                Choose the color used for sidebar icons when Monochrome style is
                selected.
              </p>
            </div>
            <span className="settings-section__hint">
              <Info size={16} weight="bold" /> This setting won&apos;t affect
              Multicolor style
            </span>
          </div>
          <RadioGroup
            label="Sidebar icon color mode"
            className="settings-icon-color-options"
          >
            {(
              [
                ["theme", "Follow color theme"],
                ["neutral", "Adaptive neutral"],
                ["custom", "Custom"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={colorMode === id}
                tabIndex={colorMode === id ? 0 : -1}
                className={`settings-icon-color-option ${colorMode === id ? "is-selected" : ""}`}
                onClick={() => update({ monochromeMode: id })}
              >
                <span className="settings-radio" aria-hidden="true">
                  {colorMode === id && <Check size={11} weight="bold" />}
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>
                    {id === "theme"
                      ? "Icons match the current theme color"
                      : id === "neutral"
                        ? "Icons adapt to light or dark mode"
                        : "Choose any color you prefer"}
                  </small>
                </span>
              </button>
            ))}
          </RadioGroup>
          <div className="settings-color-tools settings-color-tools--redesign">
            <div className="settings-color-tools__quick">
              <span className="settings-color-tools__label">Quick colors</span>
              <div
                className="settings-preset-list"
                aria-label="Monochrome color presets"
              >
                {SIDEBAR_ICON_COLORS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`settings-color-swatch ${selectedPreset === item.id ? "is-selected" : ""}`}
                    aria-label={`${item.label} icon color`}
                    aria-pressed={selectedPreset === item.id}
                    onClick={() =>
                      update({
                        monochromeMode: "custom",
                        monochromeColor: item.color,
                      })
                    }
                  >
                    <i style={{ background: item.color }} />
                  </button>
                ))}
                <span
                  className="settings-color-swatch-divider"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className={`settings-color-swatch settings-color-swatch--custom ${selectedPreset === "custom" ? "is-selected" : ""}`}
                  aria-label="Custom icon color"
                  aria-pressed={selectedPreset === "custom"}
                  onClick={() => update({ monochromeMode: "custom" })}
                >
                  <Plus size={18} weight="bold" />
                  <span>Custom</span>
                </button>
              </div>
            </div>
            <label className="settings-color-tools__value">
              <span className="settings-color-tools__label">Color value</span>
              <span className="settings-hex-input">
                <span className="sr-only">Custom monochrome icon color</span>
                <input
                  type="color"
                  value={displayColor}
                  onChange={(event) => {
                    setColorDraft(event.target.value);
                    update({
                      monochromeMode: "custom",
                      monochromeColor: event.target.value,
                    });
                  }}
                />
                <input
                  value={colorDraft}
                  onChange={(event) => setColorDraft(event.target.value)}
                  onBlur={commitColorDraft}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    commitColorDraft();
                  }}
                  pattern="^#[0-9a-fA-F]{6}$"
                  aria-invalid={!HEX_COLOR_PATTERN.test(colorDraft)}
                  aria-label="Custom monochrome icon color hex value"
                />
              </span>
            </label>
          </div>
        </section>

        <section className="settings-section settings-sidebar-glow-section">
          <div className="settings-section__heading-row">
            <div>
              <h2>Sidebar glow</h2>
              <p>
                Follow the active theme or choose a separate color atmosphere.
              </p>
            </div>
            <button
              type="button"
              className="settings-sidebar-glow-reset"
              disabled={glowIsDefault}
              onClick={() =>
                update({
                  glowPalette: SIDEBAR_GLOW_DEFAULT,
                  glowShape: SIDEBAR_GLOW_SHAPE_DEFAULT,
                  glowShapeSize: SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT,
                  glowBlur: SIDEBAR_GLOW_BLUR_DEFAULT,
                  glowIntensity: SIDEBAR_GLOW_INTENSITY_DEFAULT,
                })
              }
              aria-label="Reset sidebar glow to defaults"
            >
              <ArrowCounterClockwise size={16} weight="bold" />
              Reset
            </button>
          </div>
          <RadioGroup
            label="Sidebar glow colors"
            className="settings-sidebar-glow-options"
          >
            {SIDEBAR_GLOW_OPTIONS.map((option) => {
              const selected = glowPalette === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  className={`settings-sidebar-glow-option${selected ? " is-selected" : ""}`}
                  onClick={() => update({ glowPalette: option.id })}
                >
                  <span
                    className={`settings-sidebar-glow-option__preview${option.colors ? "" : " is-off"}${glowBlur === 0 ? " is-clear" : ""}`}
                    style={
                      option.colors
                        ? ({
                            "--settings-sidebar-glow-a": option.colors[0],
                            "--settings-sidebar-glow-b": option.colors[1],
                            "--settings-sidebar-preview-blur": `${glowBlur}px`,
                            "--settings-sidebar-preview-intensity": String(
                              glowIntensity / 100,
                            ),
                          } as React.CSSProperties)
                        : undefined
                    }
                    aria-hidden="true"
                  />
                  <span className="settings-sidebar-glow-option__copy">
                    <strong>{option.label}</strong>
                  </span>
                  <span className="settings-radio" aria-hidden="true">
                    {selected && <Check size={11} weight="bold" />}
                  </span>
                </button>
              );
            })}
          </RadioGroup>
          <div className="settings-sidebar-glow-shape">
            <h3>Bokeh shape</h3>
            <RadioGroup
              label="Bokeh shape"
              className="settings-sidebar-glow-shape-options"
            >
              {SIDEBAR_GLOW_SHAPE_OPTIONS.map((option) => {
                const selected = glowShape === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    className={`settings-sidebar-glow-shape-option${selected ? " is-selected" : ""}`}
                    onClick={() => update({ glowShape: option.id })}
                  >
                    <span
                      className={`settings-sidebar-glow-shape-option__preview is-${option.id}`}
                      aria-hidden="true"
                    />
                    <strong>{option.label}</strong>
                    <span className="settings-radio" aria-hidden="true">
                      {selected && <Check size={11} weight="bold" />}
                    </span>
                  </button>
                );
              })}
            </RadioGroup>
          </div>
          <div className="settings-sidebar-glow-size">
            <div className="settings-sidebar-glow-size__heading">
              <div>
                <h3>Size</h3>
                <p>Scale the bokeh shapes and their ambient glow area.</p>
              </div>
              <output
                className="settings-sidebar-glow-size__value"
                htmlFor="sidebar-glow-shape-size-range"
              >
                {glowShapeSize}%
              </output>
            </div>
            <label
              className="settings-sidebar-glow-size__range"
              htmlFor="sidebar-glow-shape-size-range"
            >
              <AppSlider
                id="sidebar-glow-shape-size-range"
                min={SIDEBAR_GLOW_SHAPE_SIZE_MIN}
                max={SIDEBAR_GLOW_SHAPE_SIZE_MAX}
                step="1"
                value={glowShapeSize}
                onChange={(event) =>
                  update({
                    glowShapeSize: normalizeSidebarGlowShapeSize(
                      event.target.value,
                    ),
                  })
                }
                aria-label="Sidebar glow shape size"
                aria-valuetext={`${glowShapeSize} percent`}
              />
              <span
                className="settings-sidebar-glow-size__labels"
                aria-hidden="true"
              >
                <span>Smaller</span>
                <span>Default</span>
                <span>Larger</span>
              </span>
            </label>
          </div>
          <div className="settings-sidebar-glow-blur">
            <div className="settings-sidebar-glow-blur__heading">
              <div>
                <h3>Bokeh blur</h3>
                <p>
                  Add blur above the shapes. The floating sidebar always keeps a
                  6px base blur.
                </p>
              </div>
              <output
                className="settings-sidebar-glow-blur__value"
                htmlFor="sidebar-background-blur-range"
              >
                {glowBlur}px
              </output>
            </div>
            <label
              className="settings-sidebar-glow-blur__range"
              htmlFor="sidebar-background-blur-range"
            >
              <AppSlider
                id="sidebar-background-blur-range"
                min={SIDEBAR_GLOW_BLUR_MIN}
                max={SIDEBAR_GLOW_BLUR_MAX}
                step="1"
                value={glowBlur}
                onChange={(event) =>
                  update({
                    glowBlur: normalizeSidebarGlowBlur(event.target.value),
                  })
                }
                aria-label="Additional sidebar bokeh blur"
                aria-valuetext={`${glowBlur} pixels`}
              />
              <span
                className="settings-sidebar-glow-blur__labels"
                aria-hidden="true"
              >
                <span>{SIDEBAR_GLOW_BLUR_MIN}px</span>
                <span>{SIDEBAR_GLOW_BLUR_MAX}px</span>
              </span>
            </label>
          </div>
          <div className="settings-sidebar-glow-intensity">
            <div className="settings-sidebar-glow-intensity__heading">
              <div>
                <h3>Glow intensity</h3>
                <p>Control the strength of the sidebar atmosphere.</p>
              </div>
              <output
                className="settings-sidebar-glow-intensity__value"
                htmlFor="sidebar-glow-intensity-range"
              >
                {glowIntensity}%
              </output>
            </div>
            <label
              className="settings-sidebar-glow-intensity__range"
              htmlFor="sidebar-glow-intensity-range"
            >
              <AppSlider
                id="sidebar-glow-intensity-range"
                min={SIDEBAR_GLOW_INTENSITY_MIN}
                max={SIDEBAR_GLOW_INTENSITY_MAX}
                step="1"
                value={glowIntensity}
                onChange={(event) =>
                  update({
                    glowIntensity: normalizeSidebarGlowIntensity(
                      event.target.value,
                    ),
                  })
                }
                aria-label="Sidebar glow intensity"
                aria-valuetext={`${glowIntensity} percent`}
              />
              <span
                className="settings-sidebar-glow-intensity__labels"
                aria-hidden="true"
              >
                <span>{SIDEBAR_GLOW_INTENSITY_MIN}%</span>
                <span>{SIDEBAR_GLOW_INTENSITY_MAX}%</span>
              </span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>Main content layout</h2>
          <RadioGroup
            label="Main content layout"
            className="settings-choice-grid settings-choice-grid--two"
          >
            <ChoiceCard
              checked={layout === "framed"}
              onChange={() => update({ contentLayout: "framed" })}
              label="Framed"
              note="Content sits within a framed container with side padding"
              className="settings-choice-card--horizontal settings-choice-card--layout"
              preview={<MiniSurface variant="blue" layout="framed" />}
            />
            <ChoiceCard
              checked={layout === "edge-to-edge"}
              onChange={() => update({ contentLayout: "edge-to-edge" })}
              label="Edge-to-edge"
              note="Content spans the full width of the screen"
              className="settings-choice-card--horizontal settings-choice-card--layout"
              preview={<MiniSurface variant="blue" layout="edge" />}
            />
          </RadioGroup>
        </section>

        <section className="settings-section settings-sidebar-width-section">
          <div className="settings-section__heading-row">
            <div>
              <h2>Sidebar max width</h2>
              <p>Set the widest size available when the sidebar is expanded.</p>
            </div>
            <output
              className="settings-sidebar-width__value"
              htmlFor="sidebar-max-width-range"
            >
              {sidebarMaxWidth}px
            </output>
          </div>
          <div className="settings-sidebar-width__controls">
            <label
              className="settings-sidebar-width__range"
              htmlFor="sidebar-max-width-range"
            >
              <span>Drag to adjust the maximum width</span>
              <AppSlider
                id="sidebar-max-width-range"
                min={SIDEBAR_MAX_WIDTH_MIN}
                max={SIDEBAR_MAX_WIDTH_LIMIT}
                step="1"
                value={sidebarMaxWidth}
                onChange={(event) =>
                  update({
                    sidebarMaxWidth: normalizeSidebarMaxWidth(
                      event.target.value,
                    ),
                  })
                }
                aria-label="Sidebar max width"
                aria-valuetext={`${sidebarMaxWidth} pixels`}
              />
              <span
                className="settings-sidebar-width__range-labels"
                aria-hidden="true"
              >
                <span>{SIDEBAR_MAX_WIDTH_MIN}px</span>
                <span>{SIDEBAR_MAX_WIDTH_LIMIT}px</span>
              </span>
            </label>
            <label className="settings-sidebar-width__number">
              <span>Pixels</span>
              <input
                type="number"
                min={SIDEBAR_MAX_WIDTH_MIN}
                max={SIDEBAR_MAX_WIDTH_LIMIT}
                step="1"
                value={sidebarWidthDraft}
                onChange={(event) => setSidebarWidthDraft(event.target.value)}
                onBlur={commitSidebarWidthDraft}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  commitSidebarWidthDraft();
                }}
                aria-label="Sidebar max width in pixels"
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h2>Menu behavior</h2>
          <div className="settings-row-list">
            <SettingRow
              icon={Keyboard}
              label="Show keyboard shortcuts"
              note="Display shortcut hints when hovering or focusing menu items"
            >
              <SettingsToggle
                checked={showKeyboardShortcuts}
                onChange={(value) => update({ showKeyboardShortcuts: value })}
                label="Show keyboard shortcuts"
              />
            </SettingRow>
            <SettingRow
              icon={TextT}
              label="Show labels in collapsed mode"
              note="Display text labels on hover in collapsed state"
            >
              <SettingsToggle
                checked={showLabels}
                onChange={(value) => update({ showCollapsedLabels: value })}
                label="Show labels in collapsed mode"
              />
            </SettingRow>
            <SettingRow
              icon={CircleHalf}
              label="Highlight active item with filled background"
              note="Use a filled background for the active menu item"
            >
              <SettingsToggle
                checked={highlightActive}
                onChange={(value) => update({ highlightActive: value })}
                label="Highlight active item with filled background"
              />
            </SettingRow>
            <SettingRow
              icon={Stack}
              label="Elevate sidebar menus"
              note="Add subtle edge light and depth to sidebar menu items"
            >
              <SettingsToggle
                checked={elevateMenus}
                onChange={(value) => update({ elevateMenus: value })}
                label="Elevate sidebar menus"
              />
            </SettingRow>
            <SettingRow
              icon={SidebarSimple}
              label="Hide sidebar"
              note={
                <>
                  Bring it back with{" "}
                  <kbd>{shortcutPlatform === "mac" ? "⌘+B" : "Ctrl+B"}</kbd>, or
                  use the left screen edge. On touch screens, swipe right from
                  the left side to preview it, then use the expand control to
                  pin it.
                </>
              }
            >
              <SettingsToggle
                checked={sidebarHidden}
                onChange={(value) =>
                  onSidebarModeChange?.(value ? "hidden" : "expanded")
                }
                label="Hide sidebar"
              />
            </SettingRow>
          </div>
        </section>

        <div className="settings-sidebar-category-heading">
          <span aria-hidden="true">
            <Palette size={21} weight="duotone" />
          </span>
          <div>
            <h2>Sidebar dock</h2>
            <p>
              Choose visible controls and drag their handles to reorder them.
            </p>
          </div>
          <output aria-live="polite">{dockItems.length} visible</output>
        </div>

        <section className="settings-section settings-sidebar-dock-section">
          <div className="settings-row-list" aria-label="Sidebar dock controls">
            {orderedDockOptions.map(({ id, label, note, icon }, index) => {
              const selected = dockItems.includes(id);
              const dropPosition =
                dockDropTarget?.item === id ? dockDropTarget.position : null;
              return (
                <SettingRow
                  key={id}
                  icon={icon}
                  label={label}
                  note={note}
                  data-dock-item={id}
                  className={`settings-sidebar-dock-row${draggedDockItem === id ? " is-dragging" : ""}${dropPosition ? ` is-drop-target is-drop-${dropPosition}` : ""}`}
                >
                  <button
                    type="button"
                    className="settings-dock-reorder-handle"
                    aria-label={`Reorder ${label}`}
                    aria-describedby={`sidebar-dock-position-${id}`}
                    title="Drag to reorder. Use arrow keys, Home, or End for keyboard reordering."
                    onKeyDown={(event) => moveDockItemWithKeyboard(id, event)}
                    onPointerDown={(event) => startDockPointerDrag(event, id)}
                    onPointerMove={moveDockPointerDrag}
                    onPointerUp={finishDockPointerDrag}
                    onPointerCancel={(event) =>
                      finishDockPointerDrag(event, true)
                    }
                  >
                    <DotsSixVertical size={20} weight="bold" />
                  </button>
                  <span id={`sidebar-dock-position-${id}`} className="sr-only">
                    Position {index + 1} of {orderedDockOptions.length}
                  </span>
                  <SettingsToggle
                    checked={selected}
                    onChange={() => toggleDockItem(id, selected)}
                    label={`Show ${label} in sidebar dock`}
                  />
                </SettingRow>
              );
            })}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {dockAnnouncement}
          </p>
        </section>
      </>
    </div>
  );
}
