import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type { TeamMember } from "@veolms/contracts";
import { useDeferredValue, useMemo, useState } from "react";
import { ElevatedCard } from "../../components/ElevatedCard";
import {
  FilterBar,
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../../components/FilterBar";
import {
  useRemoveTeamMember,
  useResendTeamInvitation,
  useRevokeTeamInvitation,
  useTeamMembers,
  useTeamRoles,
} from "../../services/team";
import { ConfirmActionModal } from "../../shell/ConfirmActionModal";
import { useAuthStore } from "../../store/auth.store";
import { ThemedSelect } from "../../ThemedSelect";
import type { ToastMessage } from "../../ToastNotification";
import { formatLastActive, formatTeamDate, roleLabel } from "../teamFormat";
import {
  EmptyState,
  ListSkeleton,
  LoadError,
  PersonAvatar,
  RoleChips,
  RowMenu,
  SearchField,
  StatusChip,
  rowDividerClassName,
  secondaryButtonClassName,
  tableHeaderClassName,
  type RowMenuItem,
} from "../TeamBits";
import { useTeamAccess } from "../useTeamAccess";
import { EditRolesPanel } from "./EditRolesPanel";

type Pending = { kind: "remove" | "cancel"; member: TeamMember } | null;
type StatusFilter = "all" | "active" | "invited";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const columns =
  "md:grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_2.5rem]";
const ALL_ROLES = "all";

/** The Status column: a coloured dot, a word, and a line of detail. */
function memberStatus(member: TeamMember, now = Date.now()) {
  if (member.status === "awaiting_sign_in") {
    return {
      label: "Invited",
      tone: "warning" as const,
      dot: "bg-amber-400",
      detail: `Access held until ${formatTeamDate(member.expiresAt)}`,
    };
  }
  const last = member.lastActiveAt
    ? new Date(member.lastActiveAt).getTime()
    : null;
  const detail =
    last === null
      ? "Has not signed in"
      : now - last < 5 * MINUTE_MS
        ? "Online now"
        : now - last < 7 * DAY_MS
          ? "Signed in recently"
          : `Last seen ${formatTeamDate(member.lastActiveAt)}`;
  return {
    label: "Active",
    tone: "success" as const,
    dot: "bg-emerald-400",
    detail,
  };
}

export function MembersTab({
  setNotice,
  onAddMember,
}: {
  setNotice?: (message: ToastMessage) => void;
  onAddMember: () => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const membersQuery = useTeamMembers(deferredSearch);
  const { can, canGrantRole, canReadRoles } = useTeamAccess();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<string>(ALL_ROLES);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [confirming, setConfirming] = useState<Pending>(null);
  const removeMember = useRemoveTeamMember();
  const revokeInvitation = useRevokeTeamInvitation();
  const extendAccess = useResendTeamInvitation();

  // The roles list is role.read's; without it the role filter is left out.
  const rolesQuery = useTeamRoles({ enabled: canReadRoles });
  const roles = rolesQuery.data?.roles ?? [];
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const members = useMemo(
    () => membersQuery.data?.pages.flatMap((page) => page.members) ?? [],
    [membersQuery.data],
  );
  const canAssign = can("role.assign");

  // Status and role are filtered here, on the people already loaded.
  const byRole =
    roleFilter !== ALL_ROLES
      ? members.filter((member) =>
          member.roles.some((role) => role.id === roleFilter),
        )
      : members;
  const counts = {
    all: byRole.length,
    active: byRole.filter((member) => member.status === "active").length,
    invited: byRole.filter((member) => member.status === "awaiting_sign_in")
      .length,
  };
  const shown = byRole.filter((member) =>
    statusFilter === "all"
      ? true
      : statusFilter === "active"
        ? member.status === "active"
        : member.status === "awaiting_sign_in",
  );

  const report = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      setNotice?.({ type: "success", message: success });
    } catch (cause) {
      setNotice?.({
        type: "error",
        message:
          (cause as { message?: string }).message ?? "Something went wrong.",
      });
    }
  };

  const confirm = async () => {
    if (!confirming) return;
    const { kind, member } = confirming;
    setConfirming(null);
    if (kind === "remove" && member.userId) {
      const userId = member.userId;
      await report(
        () => removeMember.mutateAsync(userId),
        `${member.name || member.email} is off the team.`,
      );
    } else if (kind === "cancel" && member.invitationId) {
      const invitationId = member.invitationId;
      await report(
        () => revokeInvitation.mutateAsync(invitationId),
        `${member.email} will not be added.`,
      );
    }
  };

  // Changing someone's roles means handing out or taking back each of them;
  // offer it only when every role they hold is yours to give.
  const manages = (member: TeamMember) =>
    member.roles.every((role) => {
      const full = rolesById.get(role.id);
      return full ? canGrantRole(full) : false;
    });

  const menuFor = (member: TeamMember): RowMenuItem[] => {
    if (member.status === "awaiting_sign_in") {
      if (!can("team.invite")) return [];
      const invitationId = member.invitationId;
      return [
        ...(manages(member)
          ? [
              {
                label: "Change roles",
                icon: PencilSimple,
                onSelect: () => setEditing(member),
              },
            ]
          : []),
        {
          label: "Extend access window",
          icon: ArrowClockwise,
          disabled: extendAccess.isPending || !invitationId,
          onSelect: () =>
            invitationId &&
            void report(
              () => extendAccess.mutateAsync(invitationId),
              `${member.email} has 7 more days to sign in.`,
            ),
        },
        {
          label: "Remove from team",
          icon: XCircle,
          danger: true,
          separated: true,
          onSelect: () => setConfirming({ kind: "cancel", member }),
        },
      ];
    }
    const editable = canAssign && manages(member);
    return [
      ...(editable
        ? [
            {
              label: "Change roles",
              icon: PencilSimple,
              onSelect: () => setEditing(member),
            },
          ]
        : []),
      ...(can("team.remove") && member.userId !== currentUserId
        ? [
            {
              label: "Remove from team",
              icon: XCircle,
              danger: true,
              separated: editable,
              onSelect: () =>
                setConfirming({ kind: "remove" as const, member }),
            },
          ]
        : []),
    ];
  };

  const statusOptions: readonly [StatusFilter, string][] = [
    ["all", `All statuses (${counts.all})`],
    ["active", `Active (${counts.active})`],
    ["invited", `Waiting for sign-in (${counts.invited})`],
  ];
  const roleOptions: readonly [string, string][] = [
    [ALL_ROLES, "All roles"],
    ...roles.map((role): [string, string] => [role.id, roleLabel(role.name)]),
  ];

  return (
    <div>
      <FilterBar className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search by name or email..."
            label="Search team members"
            className="min-w-56"
          />
          <div className={`${filterControlClasses} min-w-44`}>
            <ThemedSelect
              id="team-status-filter"
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              options={statusOptions}
              ariaLabel="Filter by status"
              triggerClassName={`${filterSelectTriggerClasses} w-full`}
            />
          </div>
          {canReadRoles ? (
            <div className={`${filterControlClasses} min-w-40`}>
              <ThemedSelect
                id="team-role-filter"
                value={roleFilter}
                onValueChange={setRoleFilter}
                options={roleOptions}
                ariaLabel="Filter by role"
                triggerClassName={`${filterSelectTriggerClasses} w-full`}
              />
            </div>
          ) : null}
        </div>
      </FilterBar>

      {membersQuery.isPending ? (
        <ListSkeleton />
      ) : membersQuery.isError ? (
        <LoadError
          icon={UsersThree}
          title="Unable to load team members"
          message={membersQuery.error.message}
          onRetry={() => void membersQuery.refetch()}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={UsersThree}
          title={deferredSearch ? "Nobody matches" : "No team members yet"}
        >
          {deferredSearch ? (
            "Try another name or email."
          ) : canAssign ? (
            <button
              type="button"
              className="cursor-pointer font-semibold text-(--accent) hover:underline"
              onClick={onAddMember}
            >
              Add someone to start your team.
            </button>
          ) : null}
        </EmptyState>
      ) : (
        <ElevatedCard as="div" className="overflow-hidden">
          <div
            className={`hidden gap-4 px-5 py-3 md:grid ${columns} ${tableHeaderClassName}`}
          >
            <span>Member</span>
            <span>Roles</span>
            <span>Status</span>
            <span>Joined</span>
            <span>Last active</span>
            <span className="sr-only">Actions</span>
          </div>
          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-(--muted)">
              Nobody matches these filters.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {shown.map((member) => {
                const status = memberStatus(member);
                const invited = member.status === "awaiting_sign_in";
                return (
                  <li
                    key={member.userId ?? member.invitationId}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-(--hover) md:gap-4 ${columns} ${rowDividerClassName}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <PersonAvatar
                        name={member.name}
                        email={member.email}
                        avatarUrl={member.avatarUrl}
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-bold text-(--text)">
                          <span className="truncate">
                            {member.name || member.email}
                          </span>
                          {member.userId === currentUserId ? (
                            <StatusChip tone="accent">You</StatusChip>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-(--muted)">
                          {invited
                            ? "Hasn't signed in yet"
                            : member.name
                              ? member.email
                              : ""}
                        </span>
                      </span>
                    </div>

                    <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">
                      <RoleChips roles={member.roles} />
                    </div>

                    <div className="col-span-2 row-start-3 flex flex-col items-start gap-1 md:col-span-1 md:row-start-auto">
                      <StatusChip tone={status.tone}>
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${status.dot}`}
                        />
                        {status.label}
                      </StatusChip>
                      <span className="text-xs text-(--muted)">
                        {status.detail}
                      </span>
                    </div>

                    <span className="hidden text-sm text-(--text-secondary) md:block">
                      {invited ? "—" : formatTeamDate(member.joinedAt)}
                    </span>
                    <span className="hidden text-sm text-(--text-secondary) md:block">
                      {invited
                        ? "Never"
                        : formatLastActive(member.lastActiveAt)}
                    </span>

                    <div className="col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
                      <RowMenu
                        label={`Actions for ${member.name || member.email}`}
                        title={member.email}
                        items={menuFor(member)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ElevatedCard>
      )}

      {membersQuery.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className={secondaryButtonClassName}
            disabled={membersQuery.isFetchingNextPage}
            onClick={() => void membersQuery.fetchNextPage()}
          >
            {membersQuery.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}

      {editing ? (
        <EditRolesPanel
          member={editing}
          onClose={() => setEditing(null)}
          setNotice={setNotice}
        />
      ) : null}

      <ConfirmActionModal
        id="team-member-confirm"
        isOpen={confirming !== null}
        isPending={removeMember.isPending || revokeInvitation.isPending}
        onClose={() => setConfirming(null)}
        onConfirm={() => void confirm()}
        icon={XCircle}
        tone="danger"
        emphasis="cancel"
        title={
          confirming?.kind === "cancel"
            ? `Remove ${confirming.member.email} from the team?`
            : `Remove ${confirming?.member.name || confirming?.member.email || "this person"} from the team?`
        }
        description={
          confirming?.kind === "cancel"
            ? "They will not get these roles when they sign in."
            : "They lose every team role at once and keep their account as a learner."
        }
        cancelLabel="Keep"
        confirmLabel="Remove"
        pendingLabel="Removing…"
      />
    </div>
  );
}
