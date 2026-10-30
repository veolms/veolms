import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { LearningSettings } from "./settings/LearningSettings";
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
  SETTINGS_DEFAULT_TAB,
  isSignedInSettingsTab,
  normalizeSettingsTab,
  readSettingsTab,
  rememberSettingsTab,
} from "./routing/tabSessionState";
import type { SettingsTab } from "./routing/tabSessionState";
import { isEditingShortcutTarget } from "./keyboardShortcuts";
import { SwipeableTabPanel } from "./navigation/SwipeableTabPanel";
import { authStore, useAuthStore } from "./store/auth.store";
import { getSettingsTabs } from "./settings/settingsTabs";
import { SettingsTabBar } from "./settings/SettingsTabBar";
import { useSettingsTabShortcuts } from "./settings/useSettingsTabShortcuts";
import { definePrerenderedBody } from "./routing/prerenderedBodies";
import "./styles/features/settings/foundation.css";
import "./styles/features/settings/preferences-responsive.css";
export type { SettingsTab } from "./routing/tabSessionState";

// Profile, notifications, privacy and the account only mean something to a
// signed-in account, so their code is a chunk of its own that a guest's
// Settings never asks for. A browser that looks signed in fetches it along
// with this page (see settingsPageBody), and an address that opens on one of
// them waits for it, so the section is there on the first render.
const signedInSettingsTabBody = definePrerenderedBody(
  () => import("./settings/SignedInSettingsTab"),
  (module) => module.SignedInSettingsTab,
);
const SignedInSettingsTab = signedInSettingsTabBody.Body;

export function preloadSignedInSettings() {
  return authStore.hasSessionHint()
    ? signedInSettingsTabBody.preload()
    : undefined;
}

export interface SettingsPageProps {
  tab?: string;
  role?: ProfileRole;
  isAuthenticated: boolean;
  /** Whether the session check has answered (false while prerendering). */
  isAuthReady?: boolean;
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
  sidebarWidthIsDefault: boolean;
  onSidebarWidthReset: () => void;
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
          sidebarWidthIsDefault={pageProps.sidebarWidthIsDefault}
          onSidebarWidthReset={pageProps.onSidebarWidthReset}
        />
      );
    case "learning":
      return <LearningSettings isAuthenticated={pageProps.isAuthenticated} />;
    default:
      return (
        <Suspense fallback={null}>
          <SignedInSettingsTab panelTab={panelTab} pageProps={pageProps} />
        </Suspense>
      );
  }
});

export function SettingsPage({
  tab = SETTINGS_DEFAULT_TAB,
  role = "student",
  isAuthenticated,
  isAuthReady = false,
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
  sidebarWidthIsDefault,
  onSidebarWidthReset,
  userRoles,
}: SettingsPageProps) {
  const activeTab = normalizeSettingsTab(tab);
  const storeIsAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // Settings routes remain reachable so users can see where to sign in, but
  // account-owned controls must follow the same live session state as the
  // shell. This also prevents stale route props from leaving controls active
  // for a signed-out user.
  const canEditAuthenticatedSettings = isAuthenticated && storeIsAuthenticated;
  // Until the session check answers (and in the prerendered document) every
  // tab is in the markup, and the signed-in ones are hidden by the head's
  // session hint, so neither a guest nor an account sees the tab row change
  // on a reload. Once it has answered, a guest's row has only their tabs.
  const isConfirmedGuest = isAuthReady && !isAuthenticated;
  const visibleTabs = getSettingsTabs(!isConfirmedGuest);
  const visibleTabIds = useMemo(
    () => visibleTabs.map(({ id }) => id),
    [visibleTabs],
  );
  const activeTabIndex = visibleTabIds.indexOf(activeTab);
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
      sidebarWidthIsDefault,
      onSidebarWidthReset,
      userRoles,
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
      onSidebarWidthReset,
      onThemeChange,
      onToggleFullscreen,
      pageTabColors,
      role,
      sidebarMode,
      sidebarPreferences,
      sidebarWidthIsDefault,
      theme,
      userRoles,
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
      const previous = visibleTabIds[activeTabIndex - 1];
      const following = visibleTabIds[activeTabIndex + 1];
      if (previous) next.add(previous);
      if (following) next.add(following);
      return next.size === current.size ? current : next;
    });
  }, [activeTabIndex, visibleTabIds]);

  // A guest who reaches a signed-in section (an old link, the tab remembered
  // from before signing out) is taken to the first of their own.
  const guestIsOnSignedInTab =
    isConfirmedGuest && isSignedInSettingsTab(activeTab);
  useEffect(() => {
    if (!guestIsOnSignedInTab) return;
    rememberSettingsTab(SETTINGS_DEFAULT_TAB);
    onNavigatePage?.(`/settings/${SETTINGS_DEFAULT_TAB}`, { replace: true });
  }, [guestIsOnSignedInTab, onNavigatePage]);

  useEffect(() => {
    if (guestIsOnSignedInTab) return;
    rememberSettingsTab(activeTab);
    prepareTab(activeTab);
  }, [activeTab, guestIsOnSignedInTab, prepareTab]);

  useEffect(() => {
    const exitSettings = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "Escape" ||
        isEditingShortcutTarget(event.target)
      )
        return;

      const transientSurfaceIsOpen = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"], [role="menu"], [role="listbox"]',
        ),
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

  useSettingsTabShortcuts({
    tabIds: visibleTabIds,
    getCurrentTab: readSettingsTab,
    onNavigate: navigateTabShortcut,
  });

  return (
    <div className="settings-page" aria-labelledby="settings-page-title">
      {/* Only the section tabs stay pinned while the page scrolls; the
          heading above them scrolls away. The header therefore takes no
          box of its own (`contents`), which lets the tabs stick against the
          page instead of being held inside a header that scrolls off. */}
      <header className="settings-page__topbar contents!">
        <div className="settings-page__heading mb-2">
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

        <SettingsTabBar
          tabs={visibleTabs}
          activeTab={activeTab}
          idPrefix="settings-tab"
          panelId="settings-tab-panel"
          label="Settings sections"
          navRef={tabListRef}
          onPrepare={prepareTab}
          onSelect={navigateTab}
          getTabClassName={(id) =>
            !isAuthReady && isSignedInSettingsTab(id)
              ? "[html:not([data-session-hint])_&]:hidden!"
              : ""
          }
        />
      </header>

      <SwipeableTabPanel
        tabs={visibleTabIds}
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
          panelTab === activeTab || preparedTabs.has(panelTab)
            ? renderSettingsTab(panelTab)
            : null
        }
      </SwipeableTabPanel>
    </div>
  );
}
