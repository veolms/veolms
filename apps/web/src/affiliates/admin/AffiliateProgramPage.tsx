import { HandshakeIcon as Handshake } from "@phosphor-icons/react/Handshake";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Button } from "../../components/Button";
import { PageHeading } from "../../components/PageHeading";
import { SwipeableTabPanel } from "../../navigation/SwipeableTabPanel";
import { useCapabilities } from "../../services/authorization";
import { SettingsTabBar } from "../../settings/SettingsTabBar";
import { AcademyPageFallback } from "../../shell/academyPageFallbacks";
import { EmptyState } from "../../team/TeamBits";
import { AffiliateCommissionsTab } from "./AffiliateCommissionsTab";
import { AffiliateOverviewTab } from "./AffiliateOverviewTab";
import { AffiliatePayoutsTab } from "./AffiliatePayoutsTab";
import {
  AFFILIATE_PROGRAM_TAB_DEFINITIONS,
  AFFILIATE_PROGRAM_TABS,
  isAffiliateProgramTab,
  type AffiliateProgramTab,
} from "./affiliateProgramTabs";
import { AffiliateSettingsTab } from "./AffiliateSettingsTab";
import { AffiliatesTab } from "./AffiliatesTab";
import { InviteAffiliatePanel } from "./InviteAffiliatePanel";
import "../../styles/features/settings/foundation.css";
import "../../styles/features/settings/preferences-responsive.css";

/**
 * /affiliate-program: the academy's affiliate program (PRD FR-15). Five
 * tabs: Overview, Affiliates, Commissions, Payouts and Settings. Reading
 * needs affiliate.read; each action checks its own permission, as the API
 * does.
 */
export function AffiliateProgramPage() {
  const capabilities = useCapabilities();
  if (capabilities.isPending) return <AcademyPageFallback />;
  if (!capabilities.can("affiliate.read")) {
    return (
      <div className="settings-page">
        <EmptyState icon={Handshake} title="Access denied">
          Your roles do not include the affiliate program.
        </EmptyState>
      </div>
    );
  }
  return <AffiliateProgramWorkspace />;
}

function AffiliateProgramWorkspace() {
  const { can } = useCapabilities();
  const navigate = useNavigate();
  const params = useParams();
  const tabListRef = useRef<HTMLElement>(null);
  const [inviting, setInviting] = useState(false);
  const activeTab: AffiliateProgramTab = isAffiliateProgramTab(params.tab)
    ? params.tab
    : "overview";

  const navigateTab = useCallback(
    (id: AffiliateProgramTab) =>
      void navigate(
        id === "overview" ? "/affiliate-program" : `/affiliate-program/${id}`,
      ),
    [navigate],
  );

  return (
    <div className="settings-page" aria-labelledby="affiliate-program-title">
      <header className="settings-page__topbar contents!">
        <div className="settings-page__heading mb-2 items-end!">
          <PageHeading
            id="affiliate-program-title"
            title="Affiliates"
            description="People who share the academy for a commission: their sales, what you owe them, and paying it."
            copyClassName="settings-page__heading-copy"
          />
          {activeTab === "affiliates" && can("affiliate.manage") ? (
            <Button
              elevation="flat"
              motion="static"
              className="shrink-0"
              onClick={() => setInviting(true)}
            >
              <PaperPlaneTilt size={17} weight="bold" aria-hidden="true" />
              Invite
            </Button>
          ) : null}
        </div>
        <SettingsTabBar
          tabs={AFFILIATE_PROGRAM_TAB_DEFINITIONS}
          activeTab={activeTab}
          idPrefix="affiliate-tab"
          panelId="affiliate-tab-panel"
          label="Affiliate program sections"
          navRef={tabListRef}
          onPrepare={() => undefined}
          onSelect={navigateTab}
        />
      </header>

      <SwipeableTabPanel
        tabs={AFFILIATE_PROGRAM_TABS}
        activeTab={activeTab}
        onTabChange={navigateTab}
        tabListRef={tabListRef}
        id="affiliate-tab-panel"
        className="settings-tab-content pt-2 pb-10"
        stateAttribute="data-affiliate-tab"
        labelledBy={`affiliate-tab-${activeTab}`}
        nativeOnFinePointer
        focusable={false}
      >
        {(panelTab) =>
          panelTab !== activeTab ? null : panelTab === "overview" ? (
            <AffiliateOverviewTab onOpenTab={navigateTab} />
          ) : panelTab === "affiliates" ? (
            <AffiliatesTab />
          ) : panelTab === "commissions" ? (
            <AffiliateCommissionsTab />
          ) : panelTab === "payouts" ? (
            <AffiliatePayoutsTab />
          ) : (
            <AffiliateSettingsTab />
          )
        }
      </SwipeableTabPanel>
      {inviting ? (
        <InviteAffiliatePanel onClose={() => setInviting(false)} />
      ) : null}
    </div>
  );
}
