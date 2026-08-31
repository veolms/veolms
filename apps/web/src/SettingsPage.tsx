import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SidebarSimpleIcon as SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { useEffect, useRef, type ComponentType } from "react";
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
import {
  normalizeSettingsTab,
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

export interface SettingsPageProps {
  tab?: string;
  role?: ProfileRole;
  onNavigatePage?: NavigateTo;
  onExitSettings?: () => void;
  onProfileSaved?: (profile: ProfilePreferences) => void;
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

function SettingsTabContent({
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
      return <NotificationSettings />;
    case "security":
      return <SecuritySettings />;
    case "account":
      return (
        <AccountSettings
          role={pageProps.role ?? "student"}
          onNavigatePage={pageProps.onNavigatePage}
        />
      );
  }
}

export function SettingsPage({
  tab = "profile",
  role = "student",
  onNavigatePage,
  onExitSettings,
  onProfileSaved,
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
  const tabListRef = useRef<HTMLElement>(null);
  const pageProps: SettingsPageProps = {
    tab,
    role,
    onNavigatePage,
    onExitSettings,
    onProfileSaved,
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
  };
  const navigateTab = (id: SettingsTab) => {
    rememberSettingsTab(id);
    onNavigatePage?.(`/settings/${id}`, { preserveScroll: true });
  };

  const renderSettingsTab = (panelTab: SettingsTab) => (
    <SettingsTabContent panelTab={panelTab} pageProps={pageProps} />
  );

  useEffect(() => {
    rememberSettingsTab(activeTab);
  }, [activeTab]);

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
      if (
        event.defaultPrevented ||
        !event.altKey ||
        isEditingShortcutTarget(event.target)
      )
        return;
      const index = getNumberShortcutIndex(event);
      const destination = index === null ? undefined : SETTINGS_TABS[index];
      if (!destination) return;
      event.preventDefault();
      onNavigatePage?.(`/settings/${destination.id}`, { preserveScroll: true });
      window.setTimeout(
        () =>
          document
            .getElementById(`settings-tab-${destination.id}`)
            ?.focus({ preventScroll: true }),
        0,
      );
    };

    document.addEventListener("keydown", navigateSettingsTab);
    return () => document.removeEventListener("keydown", navigateSettingsTab);
  }, [onNavigatePage]);

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
            className={activeTab === id ? "is-active" : ""}
            onClick={() => navigateTab(id)}
            onKeyDown={handleRovingTabKeyDown}
            onFocus={scrollKeyboardFocusedTabIntoView}
          >
            <Icon size={17} weight={activeTab === id ? "fill" : "regular"} />
            <span>{label}</span>
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
        className="settings-tab-content"
        slideClassName="pb-8"
        stateAttribute="data-settings-tab"
        labelledBy={`settings-tab-${activeTab}`}
      >
        {(panelTab) => renderSettingsTab(panelTab)}
      </SwipeableTabPanel>
    </div>
  );
}
