import type { RefObject, Dispatch, SetStateAction } from "react";
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
import { getNavigationIconColor } from "./navigation";
import { themeRevealOriginFromClick } from "./themeViewTransition";
import type { ThemeRevealOrigin } from "./themeViewTransition";
import { academyThemes } from "../themes";
import type { ReadingModePreferences } from "../reading-mode/readingModePreferences";
import { MOBILE_SHEET_DOCK_CLASS } from "./academyShellClasses";
import type {
  SidebarDockItem,
  SidebarPreferences,
} from "../settings/settingsPreferences";
import type {
  AppearanceOption,
  AppearanceSwipeSource,
} from "./academyShellTypes";

export interface MobileSheetAppearanceProps {
  mobilePaletteMenu: boolean;
  sidebarDockItems: SidebarDockItem[];
  mobileAppearanceModeTriggerRef: RefObject<HTMLButtonElement | null>;
  paletteMenuSource: "appearance" | "theme";
  consumeAppearanceGestureClick: (
    event: ReactMouseEvent<HTMLElement>,
  ) => boolean;
  cancelMobilePalettePreview: (origin?: ThemeRevealOrigin) => void;
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
  mobilePaletteTriggerRef: RefObject<HTMLButtonElement | null>;
  currentAcademyThemeIndex: number;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setPaletteMenuSource: Dispatch<SetStateAction<"appearance" | "theme">>;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
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
  updateReadingMode: (preferences: Partial<ReadingModePreferences>) => void;
  readingModeMenu: "desktop" | "mobile" | null;
  showReadingModeMenu: (mobile?: boolean) => void;
  openReadingModeMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile?: boolean,
  ) => void;
  page: string;
  sidebarPreferences: SidebarPreferences;
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
}

export function MobileSheetAppearance({
  mobilePaletteMenu,
  sidebarDockItems,
  mobileAppearanceModeTriggerRef,
  paletteMenuSource,
  consumeAppearanceGestureClick,
  cancelMobilePalettePreview,
  activateAppearanceOption,
  openAppearanceThemeMenu,
  startDockLongPress,
  moveDockLongPress,
  finishDockLongPress,
  mobilePaletteTriggerRef,
  currentAcademyThemeIndex,
  setReadingModeMenu,
  setPaletteMenuSource,
  setMobilePaletteMenu,
  startAppearanceSwipe,
  finishAppearanceSwipe,
  cancelAppearanceSwipe,
  displayedAcademyTheme,
  readingModeEnabled,
  updateReadingMode,
  readingModeMenu,
  showReadingModeMenu,
  openReadingModeMenu,
  page,
  sidebarPreferences,
  settingsControlTitle,
  primaryShortcutModifier,
  settingsQuickMenu,
  toggleSettingsNavigation,
  openSettingsQuickMenu,
  showSettingsQuickMenu,
  isFullscreen,
  fullscreenActionLabel,
  toggleFullscreen,
}: MobileSheetAppearanceProps) {
  // The theme on screen, which is the one being previewed while the colour
  // menu is open.
  const displayedThemeName = academyThemes.find(
    (themeOption) => themeOption.id === displayedAcademyTheme,
  )?.name;
  // prettier-ignore
  return (
    <div
      className={`mobile-menu-sheet__appearance sidebar-appearance--mobile-dock ${MOBILE_SHEET_DOCK_CLASS}${mobilePaletteMenu ? " mobile-menu-sheet__appearance--palette-open" : ""}`}
      role="group"
      aria-label="Appearance controls"
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
      {sidebarDockItems.map((item) => {
        if (item === "appearance") {
          return (
            <button
              key={item}
              ref={mobileAppearanceModeTriggerRef}
              data-dock-item={item}
              data-appearance-mode-toggle
              data-mobile-palette-trigger
              type="button"
              className="is-active"
              aria-haspopup="menu"
              aria-expanded={
                mobilePaletteMenu &&
                paletteMenuSource === "appearance"
              }
              aria-controls="mobile-theme-menu"
              aria-label={`Choose color theme and light or dark mode. Current theme: ${displayedThemeName}`}
              title={`Color theme - ${displayedThemeName}`}
              onClick={(event) => {
                if (consumeAppearanceGestureClick(event)) return;
                if (
                  mobilePaletteMenu &&
                  paletteMenuSource === "appearance"
                )
                  cancelMobilePalettePreview(
                    themeRevealOriginFromClick(event) ?? undefined,
                  );
                else
                  activateAppearanceOption(
                    "theme",
                    true,
                    "appearance",
                  );
              }}
              onContextMenu={(event) =>
                openAppearanceThemeMenu(event, true)
              }
              onPointerDown={(event) =>
                startDockLongPress(event, () =>
                  activateAppearanceOption(
                    "theme",
                    true,
                    "appearance",
                  ),
                )
              }
              onPointerMove={moveDockLongPress}
              onPointerUp={finishDockLongPress}
              onPointerCancel={finishDockLongPress}
            >
              <Palette size={20} weight="fill" />
            </button>
          );
        }

        if (item === "theme") {
          return (
            <button
              key={item}
              data-dock-item={item}
              ref={mobilePaletteTriggerRef}
              data-palette-trigger
              data-mobile-palette-trigger
              type="button"
              className={mobilePaletteMenu ? "is-active" : ""}
              aria-haspopup="menu"
              aria-expanded={
                mobilePaletteMenu && paletteMenuSource === "theme"
              }
              aria-controls="mobile-theme-menu"
              aria-label={`Choose color theme. Current theme: ${academyThemes[currentAcademyThemeIndex]?.name}`}
              title={`Choose color theme - ${academyThemes[currentAcademyThemeIndex]?.name}`}
              onClick={(event) => {
                if (consumeAppearanceGestureClick(event)) return;
                setReadingModeMenu(null);
                setPaletteMenuSource("theme");
                if (mobilePaletteMenu)
                  cancelMobilePalettePreview(
                    themeRevealOriginFromClick(event) ?? undefined,
                  );
                else setMobilePaletteMenu(true);
              }}
              onPointerDown={(event) =>
                startAppearanceSwipe(event, "theme")
              }
              onPointerUp={(event) =>
                finishAppearanceSwipe(event, "theme", true)
              }
              onPointerCancel={cancelAppearanceSwipe}
            >
              <Palette size={20} />
              <i
                style={{
                  background: academyThemes.find(
                    (themeOption) =>
                      themeOption.id === displayedAcademyTheme,
                  )?.preview,
                }}
              />
            </button>
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
              aria-label={`Reading mode. Hold for its settings`}
              aria-pressed={readingModeEnabled}
              title={`Reading mode - ${readingModeEnabled ? "on" : "off"} (hold for settings)`}
              aria-controls="mobile-reading-mode-quick-settings"
              // A tap turns reading mode on and off. Its menu opens on a long
              // press (the tap that ends a long press is swallowed, so it
              // does not also switch it).
              onClick={(event) => {
                if (consumeAppearanceGestureClick(event)) return;
                updateReadingMode({ enabled: !readingModeEnabled });
              }}
              onContextMenu={(event) =>
                openReadingModeMenu(event, true)
              }
              onPointerDown={(event) =>
                startDockLongPress(event, () =>
                  showReadingModeMenu(true),
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
              className={settingsActive ? "is-active" : ""}
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
              aria-expanded={settingsQuickMenu === "mobile"}
              aria-controls="mobile-settings-quick-menu"
              data-settings-quick-trigger
              onClick={(event) => {
                if (consumeAppearanceGestureClick(event)) return;
                toggleSettingsNavigation();
              }}
              onContextMenu={(event) =>
                openSettingsQuickMenu(event, true)
              }
              onPointerDown={(event) =>
                startDockLongPress(
                  event,
                  () => showSettingsQuickMenu(true),
                  true,
                )
              }
              onPointerMove={moveDockLongPress}
              onPointerUp={finishDockLongPress}
              onPointerCancel={finishDockLongPress}
            >
              <GearSix
                size={21}
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
              <CornersIn size={21} weight="bold" />
            ) : (
              <CornersOut size={21} weight="bold" />
            )}
          </button>
        );
      })}
    </div>
  );
}
