import {
  Bell,
  GearSix,
  GraduationCap,
  Palette,
  ShieldCheck,
  SidebarSimple,
  UserCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, type ComponentType } from "react";
import { handleRovingTabKeyDown } from "./accessibility/rovingTabFocus";
import { AccountSettings } from "./settings/AccountSettings";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import type { DisplayMode } from "./settings/AppearanceSettings";
import { LearningSettings } from "./settings/LearningSettings";
import { NotificationSettings } from "./settings/NotificationSettings";
import { ProfileSettings } from "./settings/ProfileSettings";
import type {
  ProfilePreferences,
  ProfileRole,
} from "./settings/profilePreferences";
import { SidebarSettings } from "./settings/SidebarSettings";
import { SecuritySettings } from "./settings/SecuritySettings";
import type {
  PageTabColors,
  SidebarMode,
  SidebarPreferences,
} from "./settings/settingsPreferences";
import type { NavigateTo } from "./routing/navigation";
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
  onThemeChange: (theme: DisplayMode) => void;
  academyTheme: string;
  onAcademyThemeChange: (themeId: string) => void;
  pageTabColors: PageTabColors;
  onPageTabColorsChange: (colors: PageTabColors) => void;
  sidebarPreferences?: SidebarPreferences;
  onSidebarPreferencesChange: (preferences: SidebarPreferences) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
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
}: SettingsPageProps) {
  const activeTab = normalizeSettingsTab(tab);
  const tabListRef = useRef<HTMLElement>(null);
  const navigateTab = (id: SettingsTab) => {
    rememberSettingsTab(id);
    onNavigatePage?.(`/settings/${id}`, { preserveScroll: true });
  };

  const renderSettingsTab = (panelTab: SettingsTab) => (
    <>
      {panelTab === "profile" && (
        <ProfileSettings
          role={role}
          onNavigatePage={onNavigatePage}
          onProfileSaved={onProfileSaved}
        />
      )}
      {panelTab === "appearance" && (
        <AppearanceSettings
          theme={theme}
          onThemeChange={onThemeChange}
          academyTheme={academyTheme}
          onAcademyThemeChange={onAcademyThemeChange}
          pageTabColors={pageTabColors}
          onPageTabColorsChange={onPageTabColorsChange}
        />
      )}
      {panelTab === "sidebar" && (
        <SidebarSettings
          sidebarPreferences={sidebarPreferences}
          onSidebarPreferencesChange={onSidebarPreferencesChange}
          academyTheme={academyTheme}
          sidebarMode={sidebarMode}
          onSidebarModeChange={onSidebarModeChange}
        />
      )}
      {panelTab === "learning" && <LearningSettings />}
      {panelTab === "notifications" && <NotificationSettings />}
      {panelTab === "security" && <SecuritySettings />}
      {panelTab === "account" && (
        <AccountSettings role={role} onNavigatePage={onNavigatePage} />
      )}
    </>
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
            onFocus={(event) =>
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "center",
              })
            }
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
        stateAttribute="data-settings-tab"
        labelledBy={`settings-tab-${activeTab}`}
      >
        {(panelTab) => renderSettingsTab(panelTab)}
      </SwipeableTabPanel>
    </div>
  );
}
