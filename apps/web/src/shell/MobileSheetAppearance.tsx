import type { RefObject, Dispatch, SetStateAction } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { CornersInIcon as CornersIn } from "@phosphor-icons/react/CornersIn";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { getNavigationIconColor } from "./navigation";
import { leavesClickToBrowser } from "./navigationLink";
import { NavCountBadge } from "./NavCountBadge";
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
    event: ReactMouseEvent<HTMLElement>,
    mobile?: boolean,
  ) => void;
  startDockLongPress: (
    event: ReactPointerEvent<HTMLElement>,
    action: () => void,
    includeMouse?: boolean,
  ) => void;
  moveDockLongPress: (event: ReactPointerEvent<HTMLElement>) => void;
  finishDockLongPress: (event: ReactPointerEvent<HTMLElement>) => void;
  mobilePaletteTriggerRef: RefObject<HTMLButtonElement | null>;
  currentAcademyThemeIndex: number;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setPaletteMenuSource: Dispatch<SetStateAction<"appearance" | "theme">>;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  startAppearanceSwipe: (
    event: ReactPointerEvent<HTMLElement>,
    source: AppearanceSwipeSource,
  ) => void;
  finishAppearanceSwipe: (
    event: ReactPointerEvent<HTMLElement>,
    source: AppearanceSwipeSource,
    mobile?: boolean,
  ) => void;
  cancelAppearanceSwipe: (event: ReactPointerEvent<HTMLElement>) => void;
  displayedAcademyTheme: string;
  readingModeEnabled: boolean;
  updateReadingMode: (preferences: Partial<ReadingModePreferences>) => void;
  readingModeMenu: "desktop" | "mobile" | null;
  showReadingModeMenu: (mobile?: boolean) => void;
  openReadingModeMenu: (
    event: ReactMouseEvent<HTMLElement>,
    mobile?: boolean,
  ) => void;
  page: string;
  /** On the Notifications icon's corner. */
  unreadNotificationCount: number;
  /** Opens the Notifications page in the app. */
  openNotifications: () => void;
  sidebarPreferences: SidebarPreferences;
  settingsControlTitle: string;
  primaryShortcutModifier: "Meta" | "Control";
  settingsQuickMenu: "desktop" | "mobile" | null;
  toggleSettingsNavigation: () => void;
  openSettingsQuickMenu: (
    event: ReactMouseEvent<HTMLElement>,
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
  unreadNotificationCount,
  openNotifications,
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

        // Notifications took Read mode's place (Read mode is in
        // Settings): a link, so it opens in a new tab with Ctrl/⌘ or the
        // middle button, with the unread count on its corner.
        if (item === "notifications") {
          const notificationsActive = page === "notifications";
          return (
            <a
              key={item}
              data-dock-item={item}
              href="/notifications"
              data-control-radius-surface=""
              className={`sidebar-appearance__notifications relative${notificationsActive ? " is-active" : ""}`}
              style={
                {
                  "--nav-icon-color": getNavigationIconColor(
                    "Notifications",
                    sidebarPreferences,
                  ),
                } as CSSProperties
              }
              aria-label="Notifications"
              title="Notifications"
              aria-current={notificationsActive ? "page" : undefined}
              aria-describedby={
                unreadNotificationCount > 0
                  ? "mobile-dock-notifications-count"
                  : undefined
              }
              onClick={(event) => {
                if (leavesClickToBrowser(event)) return;
                event.preventDefault();
                if (consumeAppearanceGestureClick(event)) return;
                openNotifications();
              }}
            >
              <Bell
                size={20}
                weight={notificationsActive ? "fill" : "regular"}
              />
              <NavCountBadge
                id="mobile-dock-notifications-count"
                count={unreadNotificationCount}
                max={9}
                unreadLabel="unread notifications"
                className="absolute top-1.5 right-[calc(50%-1.375rem)]"
              />
            </a>
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
