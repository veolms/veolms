import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { PageHeading } from "../components/PageHeading";
import { AcademyBrandSection } from "../home-page-settings/AcademyBrandSection";
import { HomePageSettingsEditor } from "../home-page-settings/HomePageSettingsEditor";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import type { NavigateTo } from "../routing/navigation";
import { usePlatformSettings } from "../services/platform";
import {
  PLATFORM_TABS,
  normalizePlatformTab,
  readPlatformTab,
  rememberPlatformTab,
  type PlatformTab,
} from "../routing/tabSessionState";
import { SettingsTabBar } from "../settings/SettingsTabBar";
import { useSettingsTabShortcuts } from "../settings/useSettingsTabShortcuts";
import { PlatformAppearanceTab } from "./PlatformAppearanceTab";
import { PlatformInvoiceTab } from "./PlatformInvoiceTab";
import { PlatformSecurityTab } from "./PlatformSecurityTab";
import {
  PLATFORM_TAB_DEFINITIONS,
  PLATFORM_TAB_PERMISSIONS,
} from "./platformTabs";
import { useCapabilities } from "../services/authorization/authorization.queries";
import "../styles/features/settings/foundation.css";
import "../styles/features/settings/preferences-responsive.css";

export interface PlatformPageProps {
  tab?: string;
  /** Only administrators may open this page; the API enforces it as well. */
  canManage: boolean;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const PlatformTabContent = memo(function PlatformTabContent({
  tab,
  setNotice,
}: {
  tab: PlatformTab;
  setNotice?: (message: string) => void;
}) {
  switch (tab) {
    case "home":
      return (
        <div className="settings-content">
          <header className="settings-detail__header">
            <div>
              <h2>Home page</h2>
              <p>
                What signed-out visitors see on the home page. To check the
                result, open the site in a private window.
              </p>
            </div>
          </header>
          <HomePageSettingsEditor setNotice={setNotice} />
        </div>
      );
    case "appearance":
      return <PlatformAppearanceTab setNotice={setNotice} />;
    case "security":
      return <PlatformSecurityTab setNotice={setNotice} />;
    case "general":
      return (
        <div className="settings-content">
          <header className="settings-detail__header">
            <div>
              <h2>General</h2>
              <p>Who your academy is, as its emails present it.</p>
            </div>
          </header>
          <AcademyBrandSection setNotice={setNotice} />
        </div>
      );
    case "invoice":
      return <PlatformInvoiceTab setNotice={setNotice} />;
  }
});

function AccessDenied({ onNavigatePage }: { onNavigatePage?: NavigateTo }) {
  return (
    <div className="settings-page">
      <section className="settings-section mx-auto mt-6 grid max-w-xl place-items-center p-10! text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <ShieldWarning size={24} weight="bold" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Access denied</h1>
        <p className="mt-1 max-w-md text-sm text-(--muted)">
          Platform settings can only be changed by academy administrators.
        </p>
        <div className="mt-4">
          <Button onClick={() => onNavigatePage?.("/")}>Return home</Button>
        </div>
      </section>
    </div>
  );
}

/**
 * The academy-wide settings an administrator manages, in tabs laid out like
 * Settings: the home page visitors see, the default look, the student sign-in
 * and enrolment rules, the academy's name and logo, and what its invoices
 * print.
 */
export function PlatformPage({
  tab,
  canManage,
  onNavigatePage,
  setNotice,
}: PlatformPageProps) {
  if (!canManage) return <AccessDenied onNavigatePage={onNavigatePage} />;
  return (
    <PlatformSettings
      tab={tab}
      onNavigatePage={onNavigatePage}
      setNotice={setNotice}
    />
  );
}

function PlatformSettings({
  tab,
  onNavigatePage,
  setNotice,
}: Omit<PlatformPageProps, "canManage">) {
  const { data: capabilities } = useCapabilities();
  // Only the sections this person may change; an administrator sees all.
  const visibleTabs = useMemo(() => {
    const held = new Set(capabilities?.permissions ?? []);
    const tabs = PLATFORM_TABS.filter((id) =>
      held.has(PLATFORM_TAB_PERMISSIONS[id]),
    );
    return tabs.length ? tabs : PLATFORM_TABS;
  }, [capabilities?.permissions]);
  const requestedTab = normalizePlatformTab(tab ?? readPlatformTab());
  const activeTab = visibleTabs.includes(requestedTab)
    ? requestedTab
    : (visibleTabs[0] ?? requestedTab);
  const activeTabIndex = visibleTabs.indexOf(activeTab);
  const tabListRef = useRef<HTMLElement>(null);
  // Read as the page opens, so the Appearance and Security tabs are ready
  // when they are opened.
  usePlatformSettings();
  // Sections are drawn once they are open or about to be (hovered, focused,
  // or next to the open one during a swipe), and then kept.
  const [preparedTabs, setPreparedTabs] = useState<ReadonlySet<PlatformTab>>(
    () => new Set([activeTab]),
  );

  const prepareTab = useCallback((id: PlatformTab) => {
    setPreparedTabs((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const navigateTab = useCallback(
    (id: PlatformTab) => {
      rememberPlatformTab(id);
      // As in Settings: the tab's pressed state paints before the route
      // change starts.
      window.requestAnimationFrame(() => {
        window.setTimeout(
          () => onNavigatePage?.(`/platform/${id}`, { resetScroll: true }),
          0,
        );
      });
    },
    [onNavigatePage],
  );

  const navigateTabShortcut = useCallback(
    (id: PlatformTab) => {
      prepareTab(id);
      rememberPlatformTab(id);
      onNavigatePage?.(`/platform/${id}`, { resetScroll: true });
    },
    [onNavigatePage, prepareTab],
  );

  const prepareSwipeNeighbors = useCallback(() => {
    setPreparedTabs((current) => {
      const next = new Set(current);
      const previous = visibleTabs[activeTabIndex - 1];
      const following = visibleTabs[activeTabIndex + 1];
      if (previous) next.add(previous);
      if (following) next.add(following);
      return next.size === current.size ? current : next;
    });
  }, [activeTabIndex, visibleTabs]);

  useEffect(() => {
    rememberPlatformTab(activeTab);
    prepareTab(activeTab);
  }, [activeTab, prepareTab]);

  useSettingsTabShortcuts({
    tabIds: visibleTabs,
    getCurrentTab: readPlatformTab,
    onNavigate: navigateTabShortcut,
  });

  return (
    <div className="settings-page" aria-labelledby="platform-page-title">
      {/* As in Settings, only the tabs stay pinned; the heading scrolls
          away, so the header takes no box of its own. */}
      <header className="settings-page__topbar contents!">
        <div className="settings-page__heading mb-2">
          <PageHeading
            id="platform-page-title"
            title="Platform"
            description="Settings for the whole academy: the home page, the default look, the rules every student follows and its invoices."
            copyClassName="settings-page__heading-copy"
          />
          <div className="settings-page__icon" aria-hidden="true">
            <SlidersHorizontal size={25} weight="regular" />
          </div>
        </div>

        <SettingsTabBar
          tabs={PLATFORM_TAB_DEFINITIONS.filter(({ id }) =>
            visibleTabs.includes(id),
          )}
          activeTab={activeTab}
          idPrefix="platform-tab"
          panelId="platform-tab-panel"
          label="Platform sections"
          navRef={tabListRef}
          onPrepare={prepareTab}
          onSelect={navigateTab}
        />
      </header>

      <SwipeableTabPanel
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={(nextTab) => navigateTab(nextTab)}
        tabListRef={tabListRef}
        id="platform-tab-panel"
        className="settings-tab-content pb-8"
        stateAttribute="data-platform-tab"
        labelledBy={`platform-tab-${activeTab}`}
        onSwipeStart={prepareSwipeNeighbors}
        nativeOnFinePointer
        focusable={false}
      >
        {(panelTab) =>
          panelTab === activeTab || preparedTabs.has(panelTab) ? (
            <PlatformTabContent tab={panelTab} setNotice={setNotice} />
          ) : null
        }
      </SwipeableTabPanel>
    </div>
  );
}
