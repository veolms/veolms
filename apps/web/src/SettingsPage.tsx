import "./styles/features/settings/foundation.css";
import "./styles/features/settings/preferences-responsive.css";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SidebarSimpleIcon as SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import {
  lazy,
  memo,
  Suspense,
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
import type { ProfilePreferences, ProfileRole } from "./settings/profileTypes";
import type {
  PageTabColors,
  SidebarMode,
  SidebarPreferences,
} from "./settings/settingsPreferences";
import type { NavigateTo } from "./routing/navigation";
import type { NavigationItemWithMetadata } from "./shell/navigation";
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
import { useAuthStore } from "./store/auth.store";
import { SettingsLoadingFallback } from "./settings/SettingsLoadingFallback";
export type { SettingsTab } from "./routing/tabSessionState";

function createSettingsTabImporter<TModule>(importer: () => Promise<TModule>) {
  let modulePromise: Promise<TModule> | undefined;
  return () => {
    modulePromise ??= importer().catch((error: unknown) => {
      modulePromise = undefined;
      throw error;
    });
    return modulePromise;
  };
}

const loadProfileSettings = createSettingsTabImporter(() =>
  import("./settings/ProfileSettings"),
);
const loadAppearanceSettings = createSettingsTabImporter(() =>
  import("./settings/AppearanceSettings"),
);
const loadSidebarSettings = createSettingsTabImporter(() =>
  import("./settings/SidebarSettings"),
);
const loadLearningSettings = createSettingsTabImporter(() =>
  import("./settings/LearningSettings"),
);
const loadNotificationSettings = createSettingsTabImporter(() =>
  import("./settings/NotificationSettings"),
);
const loadSecuritySettings = createSettingsTabImporter(() =>
  import("./settings/SecuritySettings"),
);
const loadAccountSettings = createSettingsTabImporter(() =>
  import("./settings/AccountSettings"),
);

const ProfileSettings = lazy(() =>
  loadProfileSettings().then((module) => ({
    default: module.ProfileSettings,
  })),
);
const AppearanceSettings = lazy(() =>
  loadAppearanceSettings().then((module) => ({
    default: module.AppearanceSettings,
  })),
);
const SidebarSettings = lazy(() =>
  loadSidebarSettings().then((module) => ({
    default: module.SidebarSettings,
  })),
);
const LearningSettings = lazy(() =>
  loadLearningSettings().then((module) => ({
    default: module.LearningSettings,
  })),
);
const NotificationSettings = lazy(() =>
  loadNotificationSettings().then((module) => ({
    default: module.NotificationSettings,
  })),
);
const SecuritySettings = lazy(() =>
  loadSecuritySettings().then((module) => ({
    default: module.SecuritySettings,
  })),
);
const AccountSettings = lazy(() =>
  loadAccountSettings().then((module) => ({
    default: module.AccountSettings,
  })),
);

const SETTINGS_TAB_IMPORTERS: Record<SettingsTab, () => Promise<unknown>> = {
  profile: loadProfileSettings,
  appearance: loadAppearanceSettings,
  sidebar: loadSidebarSettings,
  learning: loadLearningSettings,
  notifications: loadNotificationSettings,
  security: loadSecuritySettings,
  account: loadAccountSettings,
};

function prefetchSettingsTab(tab: SettingsTab) {
  void SETTINGS_TAB_IMPORTERS[tab]().catch(() => undefined);
}

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
          userRoles={pageProps.userRoles}
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
  const storeIsAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // Settings routes remain reachable so users can see where to sign in, but
  // account-owned controls must follow the same live session state as the
  // shell. This also prevents stale route props from leaving controls active
  // for a signed-out user.
  const canEditAuthenticatedSettings = isAuthenticated && storeIsAuthenticated;
  const tabListRef = useRef<HTMLElement>(null);
  const [swipePreviewTab, setSwipePreviewTab] = useState<SettingsTab | null>(
    null,
  );
  const pageProps = useMemo<SettingsPageProps>(
    () => ({
      role,
      isAuthenticated: canEditAuthenticatedSettings,
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
      sidebarMode,
      sidebarPreferences,
      theme,
    ],
  );
  const navigateTab = useCallback(
    (id: SettingsTab) => {
      prefetchSettingsTab(id);
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
    },
    [onNavigatePage],
  );

  const leaveSettings = useCallback(() => onExitSettings?.(), [onExitSettings]);

  const renderSettingsTab = (panelTab: SettingsTab) => (
    <SettingsTabContent panelTab={panelTab} pageProps={pageProps} />
  );

  const navigateTabShortcut = useCallback(
    (id: SettingsTab) => {
      prefetchSettingsTab(id);
      rememberSettingsTab(id);
      onNavigatePage?.(`/settings/${id}`, { preserveScroll: true });
    },
    [onNavigatePage],
  );

  const prepareSwipeTab = useCallback((tab: SettingsTab) => {
    setSwipePreviewTab(tab);
    prefetchSettingsTab(tab);
  }, []);

  const clearSwipePreview = useCallback(() => {
    setSwipePreviewTab(null);
  }, []);

  useEffect(() => {
    rememberSettingsTab(activeTab);
    setSwipePreviewTab(null);
  }, [activeTab]);

  useEffect(() => {
    const remainingTabs = SETTINGS_TAB_IDS.filter((id) => id !== activeTab);
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: (deadline: {
          didTimeout: boolean;
          timeRemaining: () => number;
        }) => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let nextTabIndex = 0;
    let startTimer: number | undefined;
    let stepTimer: number | undefined;
    let idleCallback: number | undefined;
    let cancelled = false;

    const prefetchNextTab = () => {
      if (cancelled || nextTabIndex >= remainingTabs.length) return;

      if (idleWindow.requestIdleCallback) {
        idleCallback = idleWindow.requestIdleCallback(
          (deadline) => {
            idleCallback = undefined;
            if (cancelled) return;
            if (deadline.didTimeout || deadline.timeRemaining() > 4) {
              const nextTab = remainingTabs[nextTabIndex];
              if (!nextTab) return;
              prefetchSettingsTab(nextTab);
              nextTabIndex += 1;
            }
            prefetchNextTab();
          },
          { timeout: 1800 },
        );
        return;
      }

      stepTimer = window.setTimeout(() => {
        stepTimer = undefined;
        if (cancelled) return;
        const nextTab = remainingTabs[nextTabIndex];
        if (!nextTab) return;
        prefetchSettingsTab(nextTab);
        nextTabIndex += 1;
        prefetchNextTab();
      }, 160);
    };

    startTimer = window.setTimeout(prefetchNextTab, 350);

    return () => {
      cancelled = true;
      if (startTimer !== undefined) window.clearTimeout(startTimer);
      if (stepTimer !== undefined) window.clearTimeout(stepTimer);
      if (idleCallback !== undefined) {
        idleWindow.cancelIdleCallback?.(idleCallback);
      }
    };
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
      leaveSettings();
    };

    document.addEventListener("keydown", exitSettings);
    return () => document.removeEventListener("keydown", exitSettings);
  }, [leaveSettings]);

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
            onMouseEnter={() => prefetchSettingsTab(id)}
            onPointerDown={() => prefetchSettingsTab(id)}
            onClick={() => navigateTab(id)}
            onKeyDown={handleRovingTabKeyDown}
            onFocus={(event) => {
              prefetchSettingsTab(id);
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
        onTabChange={(nextTab) => void navigateTab(nextTab)}
        tabListRef={tabListRef}
        id="settings-tab-panel"
        className="settings-tab-content pb-8"
        stateAttribute="data-settings-tab"
        labelledBy={`settings-tab-${activeTab}`}
        onSwipeStart={prepareSwipeTab}
        onSwipeEnd={clearSwipePreview}
        nativeOnFinePointer
        focusable={false}
      >
        {(panelTab) =>
          panelTab === activeTab || panelTab === swipePreviewTab ? (
            <Suspense fallback={<SettingsLoadingFallback />}>
              {renderSettingsTab(panelTab)}
            </Suspense>
          ) : (
            <div
              className="settings-content settings-content--swipe-placeholder"
              aria-hidden="true"
              inert
            />
          )
        }
      </SwipeableTabPanel>
    </div>
  );
}
