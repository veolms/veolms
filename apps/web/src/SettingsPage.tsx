import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SidebarSimpleIcon as SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  handleRovingTabKeyDown,
  scrollKeyboardFocusedTabIntoView,
} from "./accessibility/rovingTabFocus";
import type { DisplayMode } from "./settings/AppearanceSettings";
import type { ThemeRevealOrigin } from "./shell/themeViewTransition";
import type {
  ProfilePreferences,
  ProfileRole,
} from "./settings/profilePreferences";
import type {
  PageTabColors,
  SidebarMode,
  SidebarPreferences,
} from "./settings/settingsPreferences";
import type { NavigateTo } from "./routing/navigation";
import type { NavigationItemWithMetadata } from "./shell/navigation";
import type { ToastMessage } from "./ToastNotification";
import {
  normalizeSettingsTab,
  readSettingsTab,
  rememberSettingsTab,
} from "./routing/tabSessionState";
import type { SettingsTab } from "./routing/tabSessionState";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "./keyboardShortcuts";
import { SwipeableTabPanel } from "./navigation/SwipeableTabPanel";
import { AccountSettings } from "./settings/AccountSettings";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { LearningSettings } from "./settings/LearningSettings";
import { NotificationSettings } from "./settings/NotificationSettings";
import { ProfileSettings } from "./settings/ProfileSettings";
import { SecuritySettings } from "./settings/SecuritySettings";
import { useAuthStore } from "./store/auth.store";
import { SidebarSettings } from "./settings/SidebarSettings";
import "./auth/mfa-setup.css";
export type { SettingsTab } from "./routing/tabSessionState";

type SettingsTabIcon = ComponentType<{
  size?: number;
  weight?: "duotone" | "fill" | "regular";
}>;

interface SettingsTabDefinition {
  id: SettingsTab;
  label: string;
  Icon: SettingsTabIcon;
  tone: "blue" | "cyan" | "gold" | "green" | "orange" | "rose" | "violet";
}

const SETTINGS_TABS: readonly SettingsTabDefinition[] = [
  { id: "profile", label: "Profile", Icon: UserCircle, tone: "blue" },
  {
    id: "appearance",
    label: "Appearance",
    Icon: Palette,
    tone: "orange",
  },
  { id: "sidebar", label: "Sidebar", Icon: SidebarSimple, tone: "violet" },
  {
    id: "learning",
    label: "Learning",
    Icon: GraduationCap,
    tone: "green",
  },
  {
    id: "notifications",
    label: "Notifications",
    Icon: Bell,
    tone: "gold",
  },
  {
    id: "security",
    label: "Privacy & Security",
    Icon: ShieldCheck,
    tone: "cyan",
  },
  { id: "account", label: "Account", Icon: GearSix, tone: "rose" },
];

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
  onProfileSaved?: (profile: ProfilePreferences) => void;
  setNotice?: (message: ToastMessage) => void;
  theme: DisplayMode;
  onThemeChange: (theme: DisplayMode, origin?: ThemeRevealOrigin) => void;
  academyTheme: string;
  onAcademyThemeChange: (themeId: string, origin?: ThemeRevealOrigin) => void;
  pageTabColors: PageTabColors;
  onPageTabColorsChange: (colors: PageTabColors) => void;
  sidebarPreferences?: SidebarPreferences;
  onSidebarPreferencesChange: (preferences: SidebarPreferences) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  navigationItems?: readonly NavigationItemWithMetadata[];
  navigationVisibleItems?: readonly string[];
  onNavigationVisibilityChange?: (visibleItems: string[]) => void;
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
          onNavigatePage={pageProps.onNavigatePage}
          onProfileSaved={pageProps.onProfileSaved}
          setNotice={pageProps.setNotice}
          isAuthenticated={pageProps.isAuthenticated}
        />
      );
    case "appearance":
      return (
        <AppearanceSettings
          theme={pageProps.theme}
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
          navigationItems={pageProps.navigationItems}
          role={pageProps.role}
          navigationVisibleItems={pageProps.navigationVisibleItems}
          onNavigationVisibilityChange={pageProps.onNavigationVisibilityChange}
        />
      );
    case "learning":
      return <LearningSettings />;
    case "notifications":
      return (
        <NotificationSettings isAuthenticated={pageProps.isAuthenticated} />
      );
    case "security":
      return <SecuritySettings isAuthenticated={pageProps.isAuthenticated} />;
    case "account":
      return (
        <AccountSettings
          role={pageProps.role ?? "student"}
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
  onProfileSaved,
  setNotice,
  theme,
  onThemeChange,
  academyTheme,
  onAcademyThemeChange,
  pageTabColors,
  onPageTabColorsChange,
  sidebarPreferences,
  onSidebarPreferencesChange,
  sidebarMode,
  onSidebarModeChange,
  navigationItems,
  navigationVisibleItems,
  onNavigationVisibilityChange,
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
      setNotice,
      theme,
      onThemeChange,
      academyTheme,
      onAcademyThemeChange,
      pageTabColors,
      onPageTabColorsChange,
      sidebarPreferences,
      onSidebarPreferencesChange,
      sidebarMode,
      onSidebarModeChange,
      navigationItems,
      navigationVisibleItems,
      onNavigationVisibilityChange,
    }),
    [
      academyTheme,
      canEditAuthenticatedSettings,
      navigationItems,
      navigationVisibleItems,
      onAcademyThemeChange,
      onExitSettings,
      onNavigatePage,
      onNavigationVisibilityChange,
      onPageTabColorsChange,
      onProfileSaved,
      onSidebarModeChange,
      onSidebarPreferencesChange,
      onThemeChange,
      pageTabColors,
      role,
      setNotice,
      sidebarMode,
      sidebarPreferences,
      theme,
    ],
  );
  const navigateTab = (id: SettingsTab) => {
    rememberSettingsTab(id);
    window.requestAnimationFrame(() => {
      window.setTimeout(
        () =>
          onNavigatePage?.(`/settings/${id}`, {
            preserveScroll: true,
          }),
        0,
      );
    });
  };

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
      onNavigatePage?.(`/settings/${id}`, { preserveScroll: true });
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
    prepareSwipeNeighbors();
  }, [prepareSwipeNeighbors]);

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
      onExitSettings?.();
    };

    document.addEventListener("keydown", exitSettings);
    return () => document.removeEventListener("keydown", exitSettings);
  }, [onExitSettings]);

  useEffect(() => {
    const navigateSettingsTab = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingShortcutTarget(event.target))
        return;

      let destination: SettingsTabDefinition | undefined;
      if (event.altKey) {
        const index = getNumberShortcutIndex(event);
        destination = index === null ? undefined : SETTINGS_TABS[index];
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !(
          event.target instanceof Element &&
          event.target.closest(SETTINGS_ARROW_KEY_OWNER_SELECTOR)
        )
      ) {
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const currentIndex = SETTINGS_TAB_IDS.indexOf(readSettingsTab());
        const nextIndex =
          (currentIndex + offset + SETTINGS_TABS.length) % SETTINGS_TABS.length;
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
      <header className="settings-page__header">
        <div>
          <h1 id="settings-page-title">Settings</h1>
          <p>Manage your personal preferences and interface experience.</p>
        </div>
        <span className="settings-page__marker" aria-hidden="true">
          <GearSix size={24} weight="duotone" />
        </span>
      </header>

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

      <SwipeableTabPanel
        tabs={SETTINGS_TAB_IDS}
        activeTab={activeTab}
        onTabChange={navigateTab}
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
