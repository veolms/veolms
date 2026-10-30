import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "../components/Button";
import { ElevatedCard } from "../components/ElevatedCard";
import { PageHeading } from "../components/PageHeading";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import type { NavigateTo } from "../routing/navigation";
import { useTeamRoles } from "../services/team";
import { SettingsTabBar } from "../settings/SettingsTabBar";
import { AcademyPageFallback } from "../shell/academyPageFallbacks";
import type { ToastMessage } from "../ToastNotification";
import { InvitationsTab } from "./invitations/InvitationsTab";
import { InvitePanel } from "./invitations/InvitePanel";
import { AddMemberPanel } from "./members/AddMemberPanel";
import { MembersTab } from "./members/MembersTab";
import { RoleEditorPanel } from "./roles/RoleEditorPanel";
import { RolesTab } from "./roles/RolesTab";
import {
  TEAM_TAB_DEFINITIONS,
  TEAM_TABS,
  isTeamTab,
  teamTabFromPath,
  type TeamTab,
} from "./teamTabs";
import { useTeamAccess } from "./useTeamAccess";
import "../styles/features/settings/foundation.css";
import "../styles/features/settings/preferences-responsive.css";

export interface TeamPageProps {
  tab?: string;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: ToastMessage) => void;
}

type Panel = "add-member" | "invite" | "new-role" | null;

function AccessDenied({ onNavigatePage }: { onNavigatePage?: NavigateTo }) {
  return (
    <div className="settings-page">
      <ElevatedCard
        as="div"
        className="mx-auto mt-6 grid max-w-xl place-items-center p-10 text-center"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <ShieldWarning size={24} weight="bold" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Access denied</h1>
        <p className="mt-1 max-w-md text-sm text-(--muted)">
          Your roles do not include viewing the team.
        </p>
        <div className="mt-4">
          <Button
            elevation="flat"
            motion="static"
            onClick={() => onNavigatePage?.("/")}
          >
            Return home
          </Button>
        </div>
      </ElevatedCard>
    </div>
  );
}

/**
 * Who works on the academy and what each person may do: members and their
 * roles, the roles themselves, and invitations waiting to be accepted.
 */
export function TeamPage({ tab, onNavigatePage, setNotice }: TeamPageProps) {
  const access = useTeamAccess();
  if (access.isLoading) return <AcademyPageFallback />;
  if (!access.canViewPage) {
    return <AccessDenied onNavigatePage={onNavigatePage} />;
  }
  return (
    <TeamWorkspace
      tab={tab}
      onNavigatePage={onNavigatePage}
      setNotice={setNotice}
    />
  );
}

/** Members and invitations need team.read; roles need role.read. */
const TAB_PERMISSION: Record<TeamTab, "team.read" | "role.read"> = {
  members: "team.read",
  roles: "role.read",
  invitations: "team.read",
};

function TeamWorkspace({ tab, onNavigatePage, setNotice }: TeamPageProps) {
  const { pathname } = useLocation();
  const { can } = useTeamAccess();
  const [panel, setPanel] = useState<Panel>(null);
  const tabListRef = useRef<HTMLElement>(null);

  const visibleTabs = useMemo(
    () => TEAM_TABS.filter((id) => can(TAB_PERMISSION[id])),
    [can],
  );
  const requested: TeamTab = isTeamTab(tab) ? tab : teamTabFromPath(pathname);
  const activeTab = visibleTabs.includes(requested)
    ? requested
    : (visibleTabs[0] ?? requested);

  const roles = useTeamRoles({ enabled: can("role.read") });
  const customRolesEnabled = roles.data?.customRolesEnabled ?? false;

  const navigateTab = useCallback(
    (id: TeamTab) => onNavigatePage?.(`/team/${id}`, { resetScroll: true }),
    [onNavigatePage],
  );

  const action =
    activeTab === "members" && can("role.assign")
      ? { label: "Add member", icon: UserPlus, panel: "add-member" as const }
      : activeTab === "roles" && customRolesEnabled && can("role.create")
        ? { label: "New role", icon: Plus, panel: "new-role" as const }
        : activeTab === "invitations" && can("team.invite")
          ? {
              label: "Invite people",
              icon: PaperPlaneTilt,
              panel: "invite" as const,
            }
          : null;

  return (
    <div className="settings-page" aria-labelledby="team-page-title">
      {/* As on Platform, only the tabs stay pinned; the heading scrolls
          away, so the header takes no box of its own. */}
      <header className="settings-page__topbar contents!">
        <div className="settings-page__heading mb-2 items-end!">
          <PageHeading
            id="team-page-title"
            title="Team"
            description="Who works on the academy and what each person may do."
            copyClassName="settings-page__heading-copy"
          />
          {action ? (
            <Button
              elevation="flat"
              motion="static"
              className="shrink-0"
              onClick={() => setPanel(action.panel)}
            >
              <action.icon size={17} weight="bold" />
              {action.label}
            </Button>
          ) : null}
        </div>

        <SettingsTabBar
          tabs={TEAM_TAB_DEFINITIONS.filter(({ id }) =>
            visibleTabs.includes(id),
          )}
          activeTab={activeTab}
          idPrefix="team-tab"
          panelId="team-tab-panel"
          label="Team sections"
          navRef={tabListRef}
          onPrepare={() => undefined}
          onSelect={navigateTab}
        />
      </header>

      <SwipeableTabPanel
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={navigateTab}
        tabListRef={tabListRef}
        id="team-tab-panel"
        className="settings-tab-content pt-2 pb-10"
        stateAttribute="data-team-tab"
        labelledBy={`team-tab-${activeTab}`}
        nativeOnFinePointer
        focusable={false}
      >
        {(panelTab) =>
          panelTab !== activeTab ? null : panelTab === "members" ? (
            <MembersTab
              setNotice={setNotice}
              onAddMember={() => setPanel("add-member")}
            />
          ) : panelTab === "roles" ? (
            <RolesTab setNotice={setNotice} />
          ) : (
            <InvitationsTab
              setNotice={setNotice}
              onInvite={() => setPanel("invite")}
              onViewMember={() => navigateTab("members")}
            />
          )
        }
      </SwipeableTabPanel>

      {panel === "add-member" ? (
        <AddMemberPanel onClose={() => setPanel(null)} setNotice={setNotice} />
      ) : null}
      {panel === "invite" ? (
        <InvitePanel onClose={() => setPanel(null)} />
      ) : null}
      {panel === "new-role" ? (
        <RoleEditorPanel
          target={{ mode: "create" }}
          customRolesEnabled={customRolesEnabled}
          onClose={() => setPanel(null)}
          onDuplicate={() => undefined}
          setNotice={setNotice}
        />
      ) : null}
    </div>
  );
}
