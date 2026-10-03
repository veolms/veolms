import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  handleRovingTabKeyDown,
  scrollKeyboardFocusedTabIntoView,
} from "./accessibility/rovingTabFocus";
import { AccountSettings } from "./settings/AccountSettings";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { LearningSettings } from "./settings/LearningSettings";
import { NotificationSettings } from "./settings/NotificationSettings";
import { ProfileSettings } from "./settings/ProfileSettings";
import { SecuritySettings } from "./settings/SecuritySettings";
import { SidebarSettings } from "./settings/SidebarSettings";
import type { DisplayMode } from "./settings/AppearanceSettings";
import type { ThemeRevealOrigin } from "./shell/themeViewTransition";
import type { ProfilePreferences, ProfileRole } from "./settings/profileTypes";
import type {
  PageTabColors,
  SidebarMode,
  SidebarPreferences,
} from "./settings/settingsPreferences";
import type { NavigateTo } from "./routing/navigation";
import { PageHeading } from "./components/PageHeading";
import {
  normalizeSettingsTab,
  readSettingsTab,
  rememberSettingsTab,
} from "./routing/tabSessionState";
import type { SettingsTab } from "./routing/tabSessionState";
import { getNumberShortcutIndex, isEditingShortcutTarget } from "./keyboardShortcuts";
import { SwipeableTabPanel } from "./navigation/SwipeableTabPanel";
import { useAuthStore } from "./store/auth.store";
import { SETTINGS_TABS } from "./settings/settingsTabs";
import "./styles/features/settings/foundation.css";
import "./styles/features/settings/preferences-responsive.css";
export type { SettingsTab } from "./routing/tabSessionState";

const SETTINGS_TAB_IDS = SETTINGS_TABS.map(({ id }) => id);
const SETTINGS_ARROW_KEY_OWNER_SELECTOR = [
  '[role="dialog"]',
  '[role="grid"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="tab"]',
  '[role="tree"]',
].join(",");

export interface SettingsPageProps {
  tab?: string;
  role?: ProfileRole;
  isAuthenticated: boolean;
  onNavigatePage?: NavigateTo;
  onExitSettings?: () => void;
  showBackButton?: boolean;
  onProfileSaved?: (profile: ProfilePreferences) => void;
  theme: DisplayMode;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onThemeChange: (theme: DisplayMode, origin?: ThemeRevealOrigin) => void;
  academyTheme: string;
  onAcademyThemeChange: (themeId: string, origin?: ThemeRevealOrigin) => void;
  pageTabColors: PageTabColors;
  onPageTabColorsChange: (colors: PageTabColors) => void;
  sidebarPreferences?: SidebarPreferences;
  onSidebarPreferencesChange: (preferences: SidebarPreferences) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  userRoles?: readonly string[] | null;
}

const SettingsTabContent = memo(function SettingsTabContent({
  panelTab,
  pageProps,
}: {
  panelTab: SettingsTab;
  pageProps: SettingsPageProps;
}) {
  switch (panelTab) {
    case "profile":
      return (
        <ProfileSettings
          role={pageProps.role}
          onProfileSaved={pageProps.onProfileSaved}
          isAuthenticated={pageProps.isAuthenticated}
        />
      );
    case "appearance":
      return (
        <AppearanceSettings
          theme={pageProps.theme}
          isFullscreen={pageProps.isFullscreen}
          onToggleFullscreen={pageProps.onToggleFullscreen}
          onThemeChange={pageProps.onThemeChange}
          academyTheme={pageProps.academyTheme}
          onAcademyThemeChange={pageProps.onAcademyThemeChange}
          pageTabColors={pageProps.pageTabColors}
          onPageTabColorsChange={pageProps.onPageTabColorsChange}
        />
      );
    case "sidebar":
      return (
        <SidebarSettings
          sidebarPreferences={pageProps.sidebarPreferences}
          onSidebarPreferencesChange={pageProps.onSidebarPreferencesChange}
          academyTheme={pageProps.academyTheme}
          sidebarMode={pageProps.sidebarMode}
          onSidebarModeChange={pageProps.onSidebarModeChange}
        />
      );
    case "learning":
      return <LearningSettings />;
    case "notifications":
      return <NotificationSettings isAuthenticated={pageProps.isAuthenticated} />;
    case "security":
      return <SecuritySettings isAuthenticated={pageProps.isAuthenticated} />;
    case "account":
      return (
        <AccountSettings
          role={pageProps.role ?? "student"}
          userRoles={pageProps.userRoles}
          isAuthenticated={pageProps.isAuthenticated}
          onNavigatePage={pageProps.onNavigatePage}
        />
      );
  }
});

export function SettingsPage({
  tab = "profile",
  role = "student",
  isAuthenticated,
  onNavigatePage,
  onExitSettings,
  showBackButton = false,
  onProfileSaved,
  theme,
  isFullscreen,
  onToggleFullscreen,
  onThemeChange,
  academyTheme,
  onAcademyThemeChange,
  pageTabColors,
  onPageTabColorsChange,
  sidebarPreferences,
  onSidebarPreferencesChange,
  sidebarMode,
  onSidebarModeChange,
}: SettingsPageProps) {
  const activeTab = normalizeSettingsTab(tab);
  const storeIsAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // Settings routes remain reachable so users can see where to sign in, but
  // account-owned controls must follow the same live session state as the
  // shell. This also prevents stale route props from leaving controls active
  // for a signed-out user.
  const canEditAuthenticatedSettings = isAuthenticated && storeIsAuthenticated;
  const activeTabIndex = SETTINGS_TAB_IDS.indexOf(activeTab);
  const [preparedTabs, setPreparedTabs] = useState<ReadonlySet<SettingsTab>>(
    () => new Set([activeTab]),
  );
  const tabListRef = useRef<HTMLElement>(null);
  const pageProps = useMemo<SettingsPageProps>(
    () => ({
      role,
      isAuthenticated: canEditAuthenticatedSettings,
      onNavigatePage,
      onExitSettings,
      onProfileSaved,
      theme,
      isFullscreen,
      onToggleFullscreen,
      onThemeChange,
      academyTheme,
      onAcademyThemeChange,
      pageTabColors,
      onPageTabColorsChange,
      sidebarPreferences,
      onSidebarPreferencesChange,
      sidebarMode,
      onSidebarModeChange,
    }),
    [
      academyTheme,
      canEditAuthenticatedSettings,
      isFullscreen,
      onAcademyThemeChange,
      onExitSettings,
      onNavigatePage,
      onPageTabColorsChange,
      onProfileSaved,
      onSidebarModeChange,
      onSidebarPreferencesChange,
      onThemeChange,
      onToggleFullscreen,
      pageTabColors,
      role,
      sidebarMode,
      sidebarPreferences,
      theme,
    ],
  );
  const navigateTab = useCallback(
    (id: SettingsTab) => {
      rememberSettingsTab(id);
      window.requestAnimationFrame(() => {
        window.setTimeout(
          () =>
            onNavigatePage?.(`/settings/${id}`, {
              resetScroll: true,
            }),
          0,
        );
      });
    },
    [onNavigatePage],
  );

  const leaveSettings = useCallback(() => onExitSettings?.(), [onExitSettings]);

  const renderSettingsTab = (panelTab: SettingsTab) => (
    <SettingsTabContent panelTab={panelTab} pageProps={pageProps} />
  );

  const prepareTab = useCallback((id: SettingsTab) => {
    setPreparedTabs((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const navigateTabShortcut = useCallback(
    (id: SettingsTab) => {
      prepareTab(id);
      rememberSettingsTab(id);
      onNavigatePage?.(`/settings/${id}`, { resetScroll: true });
    },
    [onNavigatePage, prepareTab],
  );

  const prepareSwipeNeighbors = useCallback(() => {
    setPreparedTabs((current) => {
      const next = new Set(current);
      const previous = SETTINGS_TAB_IDS[activeTabIndex - 1];
      const following = SETTINGS_TAB_IDS[activeTabIndex + 1];
      if (previous) next.add(previous);
      if (following) next.add(following);
      return next.size === current.size ? current : next;
    });
  }, [activeTabIndex]);

  useEffect(() => {
    rememberSettingsTab(activeTab);
    prepareTab(activeTab);
  }, [activeTab, prepareTab]);

  useEffect(() => {
    const exitSettings = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || isEditingShortcutTarget(event.target))
        return;

      const transientSurfaceIsOpen = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], [role="listbox"]'),
      ).some((element) => {
        const style = getComputedStyle(element);
        return (
          element.getClientRects().length > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });
      if (transientSurfaceIsOpen) return;

      event.preventDefault();
      leaveSettings();
    };

    document.addEventListener("keydown", exitSettings);
    return () => document.removeEventListener("keydown", exitSettings);
  }, [leaveSettings]);

  useEffect(() => {
    const navigateSettingsTab = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingShortcutTarget(event.target)) return;

      let destination: (typeof SETTINGS_TABS)[number] | undefined;
      if (event.altKey) {
        const index = getNumberShortcutIndex(event);
        destination = index === null ? undefined : SETTINGS_TABS[index];
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !(
          event.target instanceof Element && event.target.closest(SETTINGS_ARROW_KEY_OWNER_SELECTOR)
        )
      ) {
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const currentIndex = SETTINGS_TAB_IDS.indexOf(readSettingsTab());
        const nextIndex = (currentIndex + offset + SETTINGS_TABS.length) % SETTINGS_TABS.length;
        destination = SETTINGS_TABS[nextIndex];
      }

      if (!destination) return;
      event.preventDefault();
      navigateTabShortcut(destination.id);
    };

    document.addEventListener("keydown", navigateSettingsTab);
    return () => document.removeEventListener("keydown", navigateSettingsTab);
  }, [navigateTabShortcut]);

  return (
    <div className="settings-page" aria-labelledby="settings-page-title">
      <header className="settings-page__topbar">
        <div className="settings-page__heading">
          <PageHeading
            id="settings-page-title"
            title="Settings"
            description="Manage your personal preferences and interface experience."
            onNavigateBack={showBackButton ? leaveSettings : undefined}
            copyClassName="settings-page__heading-copy"
          />
          <div className="settings-page__icon" aria-hidden="true">
            <GearSix size={25} weight="regular" />
          </div>
        </div>

        <nav
          ref={tabListRef}
          className="settings-tabs page-tabs"
          aria-label="Settings sections"
          role="tablist"
        >
          {SETTINGS_TABS.map(({ id, label, Icon, tone }, index) => (
            <button
              type="button"
              key={id}
              id={`settings-tab-${id}`}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls="settings-tab-panel"
              aria-keyshortcuts={`Alt+${index + 1}`}
              data-page-tab-tone={tone}
              data-swipe-tab-id={id}
              tabIndex={activeTab === id ? 0 : -1}
              className={activeTab === id ? "group is-active" : "group"}
              onPointerEnter={() => prepareTab(id)}
              onPointerDown={() => prepareTab(id)}
              onClick={() => navigateTab(id)}
              onKeyDown={handleRovingTabKeyDown}
              onFocus={(event) => {
                prepareTab(id);
                scrollKeyboardFocusedTabIntoView(event);
              }}
            >
              <span className="settings-tab__press-content inline-flex origin-bottom items-center gap-2 transition-transform duration-150 ease-out group-active:scale-[0.985] motion-reduce:duration-[0.01ms]">
                <Icon size={17} weight={activeTab === id ? "fill" : "regular"} />
                <span>{label}</span>
              </span>
            </button>
          ))}
          <span className="page-tabs__indicator" aria-hidden="true" />
        </nav>
      </header>

      <SwipeableTabPanel
        tabs={SETTINGS_TAB_IDS}
        activeTab={activeTab}
        onTabChange={(nextTab) => void navigateTab(nextTab)}
        tabListRef={tabListRef}
        id="settings-tab-panel"
        className="settings-tab-content pb-8"
        stateAttribute="data-settings-tab"
        labelledBy={`settings-tab-${activeTab}`}
        onSwipeStart={prepareSwipeNeighbors}
        nativeOnFinePointer
        focusable={false}
      >
        {(panelTab) =>
          panelTab === activeTab || preparedTabs.has(panelTab) ? renderSettingsTab(panelTab) : null
        }
      </SwipeableTabPanel>
    </div>
  );
}
