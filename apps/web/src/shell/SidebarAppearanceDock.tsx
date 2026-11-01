import {
  Suspense,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { CornersInIcon as CornersIn } from "@phosphor-icons/react/CornersIn";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { AcademyPaletteMenu } from "./AcademyPaletteMenu";
import { getNavigationIconColor } from "./navigation";
import { themeRevealOriginFromClick } from "./themeViewTransition";
import type { ThemeRevealOrigin } from "./themeViewTransition";
import { academyThemes } from "../themes";
import type {
  SidebarDockItem,
  SidebarPreferences,
} from "../settings/settingsPreferences";
import type { ReadingModeColors } from "../reading-mode/readingModePreferences";
import type { ReadingModePreferences } from "../reading-mode/readingModePreferences";
import { ReadingModeQuickMenu } from "./academyLazyPages";
import { SIDEBAR_DOCK_CLASS } from "./academyShellClasses";
import type {
  AppearanceOption,
  AppearanceSwipeSource,
} from "./academyShellTypes";

export interface SidebarAppearanceDockProps {
  appearanceControlsRef: RefObject<HTMLDivElement | null>;
  appearanceControlsHorizontal: boolean;
  sidebarPreferences: SidebarPreferences;
  sidebarDockItems: SidebarDockItem[];
  appearanceModeTriggerRef: RefObject<HTMLButtonElement | null>;
  paletteMenu: boolean;
  paletteMenuSource: "appearance" | "theme";
  consumeAppearanceGestureClick: (
    event: ReactMouseEvent<HTMLElement>,
  ) => boolean;
  cancelDesktopPalettePreview: (origin?: ThemeRevealOrigin) => void;
  activateAppearanceOption: (
    option: AppearanceOption,
    mobile?: boolean,
    source?: "appearance" | "theme",
  ) => void;
  openAppearanceThemeMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile?: boolean,
  ) => void;
  startDockLongPress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    action: () => void,
    includeMouse?: boolean,
  ) => void;
  moveDockLongPress: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  finishDockLongPress: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  paletteTriggerRef: RefObject<HTMLButtonElement | null>;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setPaletteMenuSource: Dispatch<SetStateAction<"appearance" | "theme">>;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  startAppearanceSwipe: (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
  ) => void;
  finishAppearanceSwipe: (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
    mobile?: boolean,
  ) => void;
  cancelAppearanceSwipe: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  displayedAcademyTheme: string;
  readingModeEnabled: boolean;
  readingModeMenu: "desktop" | "mobile" | null;
  showReadingModeMenu: (mobile?: boolean) => void;
  openReadingModeMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile?: boolean,
  ) => void;
  page: string;
  settingsControlTitle: string;
  primaryShortcutModifier: "Meta" | "Control";
  settingsQuickMenu: "desktop" | "mobile" | null;
  toggleSettingsNavigation: () => void;
  openSettingsQuickMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile?: boolean,
  ) => void;
  showSettingsQuickMenu: (mobile?: boolean) => void;
  isFullscreen: boolean;
  fullscreenActionLabel: "Exit fullscreen" | "Fullscreen";
  toggleFullscreen: () => Promise<void>;
  sidebarCollapsed: boolean;
  readingModePreferences: {
    enabled: boolean;
    colorTemperature: number;
    texture: number;
    textureGrainSize: number;
    colors: ReadingModeColors;
  };
  updateReadingMode: (preferences: Partial<ReadingModePreferences>) => void;
  changePalette: (nextTheme: string, origin?: ThemeRevealOrigin) => void;
  previewAcademyTheme: (themeId: string, origin?: ThemeRevealOrigin) => void;
  confirmDesktopPaletteTheme: (themeId: string) => void;
  resolvedTheme: "light" | "dark";
  changeAppearanceMode: (
    mode: "light" | "dark",
    origin?: ThemeRevealOrigin,
  ) => void;
}

export function SidebarAppearanceDock({
  appearanceControlsRef,
  appearanceControlsHorizontal,
  sidebarPreferences,
  sidebarDockItems,
  appearanceModeTriggerRef,
  paletteMenu,
  paletteMenuSource,
  consumeAppearanceGestureClick,
  cancelDesktopPalettePreview,
  activateAppearanceOption,
  openAppearanceThemeMenu,
  startDockLongPress,
  moveDockLongPress,
  finishDockLongPress,
  paletteTriggerRef,
  setReadingModeMenu,
  setPaletteMenuSource,
  setPaletteMenu,
  startAppearanceSwipe,
  finishAppearanceSwipe,
  cancelAppearanceSwipe,
  displayedAcademyTheme,
  readingModeEnabled,
  readingModeMenu,
  showReadingModeMenu,
  openReadingModeMenu,
  page,
  settingsControlTitle,
  primaryShortcutModifier,
  settingsQuickMenu,
  toggleSettingsNavigation,
  openSettingsQuickMenu,
  showSettingsQuickMenu,
  isFullscreen,
  fullscreenActionLabel,
  toggleFullscreen,
  sidebarCollapsed,
  readingModePreferences,
  updateReadingMode,
  changePalette,
  previewAcademyTheme,
  confirmDesktopPaletteTheme,
  resolvedTheme,
  changeAppearanceMode,
}: SidebarAppearanceDockProps) {
  // The theme on screen, which is the one being previewed while the colour
  // menu is open.
  const displayedThemeName = academyThemes.find(
    (themeOption) => themeOption.id === displayedAcademyTheme,
  )?.name;
  // prettier-ignore
  return (
    <div
      ref={appearanceControlsRef}
      className={`sidebar-appearance sidebar-appearance--mobile-dock sidebar-appearance--${appearanceControlsHorizontal ? "horizontal" : "vertical"} ${SIDEBAR_DOCK_CLASS}`}
      role="group"
      aria-label="Appearance controls"
      data-control-radius-surface
      style={
        {
          "--dock-appearance-icon-color": getNavigationIconColor(
            "Appearance",
            sidebarPreferences,
          ),
          "--dock-reading-mode-icon-color": getNavigationIconColor(
            "Reading mode",
            sidebarPreferences,
          ),
        } as CSSProperties
      }
    >
      {sidebarDockItems.map((item: SidebarDockItem) => {
        if (item === "appearance") {
          return (
            <button
              key={item}
              ref={appearanceModeTriggerRef}
              data-dock-item={item}
              data-appearance-mode-toggle
              data-palette-trigger
              type="button"
              className="is-active"
              aria-haspopup="menu"
              aria-expanded={
                paletteMenu && paletteMenuSource === "appearance"
              }
              aria-controls="desktop-theme-menu"
              aria-label={`Choose color theme and light or dark mode. Current theme: ${displayedThemeName}`}
              title={`Color theme - ${displayedThemeName}`}
              onClick={(event) => {
                if (consumeAppearanceGestureClick(event)) return;
                if (paletteMenu && paletteMenuSource === "appearance")
                  cancelDesktopPalettePreview(
                    themeRevealOriginFromClick(event) ?? undefined,
                  );
                else
                  activateAppearanceOption(
                    "theme",
                    false,
                    "appearance",
                  );
              }}
              onContextMenu={openAppearanceThemeMenu}
              onPointerDown={(event) =>
                startDockLongPress(event, () =>
                  activateAppearanceOption(
                    "theme",
                    false,
                    "appearance",
                  ),
                )
              }
              onPointerMove={moveDockLongPress}
              onPointerUp={finishDockLongPress}
              onPointerCancel={finishDockLongPress}
            >
              <Palette size={19} weight="fill" />
            </button>
          );
        }

        if (item === "theme") {
          return (
            <div
              className="sidebar-palette-wrap"
              data-dock-item={item}
              key={item}
            >
              <button
                ref={paletteTriggerRef}
                data-palette-trigger
                type="button"
                className="sidebar-palette-trigger"
                aria-label="Choose color theme"
                title="Choose color theme"
                aria-haspopup="menu"
                aria-expanded={
                  paletteMenu && paletteMenuSource === "theme"
                }
                aria-controls="desktop-theme-menu"
                aria-pressed={
                  paletteMenu && paletteMenuSource === "theme"
                }
                onClick={(event) => {
                  if (consumeAppearanceGestureClick(event)) return;
                  setReadingModeMenu(null);
                  setPaletteMenuSource("theme");
                  if (paletteMenu)
                    cancelDesktopPalettePreview(
                      themeRevealOriginFromClick(event) ?? undefined,
                    );
                  else setPaletteMenu(true);
                }}
                onPointerDown={(event) =>
                  startAppearanceSwipe(event, "theme")
                }
                onPointerUp={(event) =>
                  finishAppearanceSwipe(event, "theme")
                }
                onPointerCancel={cancelAppearanceSwipe}
              >
                <Palette size={19} />
                <i
                  style={{
                    background: academyThemes.find(
                      (themeOption) =>
                        themeOption.id === displayedAcademyTheme,
                    )?.preview,
                  }}
                />
              </button>
            </div>
          );
        }

        if (item === "reading-mode") {
          return (
            <button
              key={item}
              data-dock-item={item}
              data-reading-mode-trigger
              type="button"
              className={`sidebar-appearance__reading-mode${readingModeEnabled ? " is-active" : ""}`}
              aria-label={`Reading mode. Right-click or hold for its settings`}
              aria-pressed={readingModeEnabled}
              aria-controls="desktop-reading-mode-quick-settings"
              title={`Reading mode - ${readingModeEnabled ? "on" : "off"} (right-click or hold for settings)`}
              // A click turns reading mode on and off. Its menu opens on a
              // right-click or a long press (the click that ends a long
              // press is swallowed, so it does not also switch it).
              onClick={(event) => {
                if (consumeAppearanceGestureClick(event)) return;
                updateReadingMode({ enabled: !readingModeEnabled });
              }}
              onContextMenu={openReadingModeMenu}
              onPointerDown={(event) =>
                startDockLongPress(
                  event,
                  () => showReadingModeMenu(false),
                  true,
                )
              }
              onPointerMove={moveDockLongPress}
              onPointerUp={finishDockLongPress}
              onPointerCancel={finishDockLongPress}
            >
              <Eye
                aria-hidden="true"
                data-reading-mode-icon="off"
                size={20}
                weight="regular"
              />
              <Eye
                aria-hidden="true"
                data-reading-mode-icon="on"
                size={20}
                weight="fill"
              />
            </button>
          );
        }

        if (item === "settings") {
          const settingsActive = page === "settings";
          return (
            <button
              key={item}
              data-dock-item={item}
              type="button"
              className={`sidebar-appearance__settings${settingsActive ? " is-active" : ""}`}
              style={
                {
                  "--nav-icon-color": getNavigationIconColor(
                    "Settings",
                    sidebarPreferences,
                  ),
                } as CSSProperties
              }
              aria-label="Open settings"
              title={settingsControlTitle}
              aria-current={settingsActive ? "page" : undefined}
              aria-keyshortcuts={`${primaryShortcutModifier}+Comma`}
              aria-haspopup="menu"
              aria-expanded={settingsQuickMenu === "desktop"}
              aria-controls="desktop-settings-quick-menu"
              data-settings-quick-trigger
              onClick={(event) => {
                if (consumeAppearanceGestureClick(event)) return;
                toggleSettingsNavigation();
              }}
              onContextMenu={(event) =>
                openSettingsQuickMenu(event, false)
              }
              onPointerDown={(event) =>
                startDockLongPress(
                  event,
                  () => showSettingsQuickMenu(false),
                  true,
                )
              }
              onPointerMove={moveDockLongPress}
              onPointerUp={finishDockLongPress}
              onPointerCancel={finishDockLongPress}
            >
              <GearSix
                size={20}
                weight={settingsActive ? "fill" : "regular"}
              />
            </button>
          );
        }

        return (
          <button
            key={item}
            data-dock-item={item}
            type="button"
            // Not shown when the app runs installed: it fills the screen as
            // it is, and fullscreen would hide the status bar.
            className={`sidebar-appearance__fullscreen [@media(display-mode:standalone)]:hidden!${isFullscreen ? " is-active" : ""}`}
            aria-label={fullscreenActionLabel}
            title={fullscreenActionLabel}
            aria-pressed={isFullscreen}
            aria-keyshortcuts="F11"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? (
              <CornersIn size={20} weight="bold" />
            ) : (
              <CornersOut size={20} weight="bold" />
            )}
          </button>
        );
      })}
      {readingModeMenu === "desktop" && (
        <Suspense fallback={null}>
          <ReadingModeQuickMenu
            id="desktop-reading-mode-quick-settings"
            className={
              sidebarCollapsed
                ? "reading-mode-quick-menu--collapsed"
                : ""
            }
            preferences={readingModePreferences}
            onChange={updateReadingMode}
          />
        </Suspense>
      )}
      {paletteMenu && (
        <AcademyPaletteMenu
          themes={academyThemes}
          selectedTheme={displayedAcademyTheme}
          id="desktop-theme-menu"
          className={`sidebar-palette-menu sidebar-palette-menu--dock-attached${sidebarCollapsed ? " sidebar-palette-menu--collapsed" : ""}`}
          onSelect={changePalette}
          onPreview={previewAcademyTheme}
          onConfirm={confirmDesktopPaletteTheme}
          onCancel={cancelDesktopPalettePreview}
          appearanceMode={resolvedTheme}
          onAppearanceModeChange={changeAppearanceMode}
        />
      )}
    </div>
  );
}
