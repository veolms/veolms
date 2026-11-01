import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { UserIcon as User } from "@phosphor-icons/react/User";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type { TeamInvitation } from "@veolms/contracts";
import { useMemo, useState } from "react";
import { ElevatedCard } from "../../components/ElevatedCard";
import {
  FilterBar,
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../../components/FilterBar";
import {
  useResendTeamInvitation,
  useRevokeTeamInvitation,
  useTeamInvitations,
  useTeamRoles,
} from "../../services/team";
import { ConfirmActionModal } from "../../shell/ConfirmActionModal";
import { ThemedSelect } from "../../ThemedSelect";
import type { ToastMessage } from "../../ToastNotification";
import { EditRolesPanel, type RolesHolder } from "../members/EditRolesPanel";
import {
  ListSkeleton,
  LoadError,
  RoleChips,
  RowMenu,
  rowDividerClassName,
  secondaryButtonClassName,
  tableHeaderClassName,
  type RowMenuItem,
} from "../TeamBits";
import { useTeamAccess } from "../useTeamAccess";
import { InvitationsEmpty } from "./InvitationsEmpty";
import {
  invitationState,
  sentLabel,
  type InvitationTone,
} from "./invitationState";

const FILTERS = [
  { id: "all", label: "All invitations" },
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "expired", label: "Expired" },
  { id: "revoked", label: "Revoked" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const TONES: Record<InvitationTone, { text: string; bar: string }> = {
  pending: { text: "text-(--accent)", bar: "bg-(--accent)" },
  soon: { text: "text-orange-400", bar: "bg-orange-400" },
  accepted: { text: "text-emerald-400", bar: "bg-emerald-400" },
  muted: { text: "text-(--muted)", bar: "bg-(--muted)" },
};

const columns =
  "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_2.5rem]";

/** An invitation as the roles panel takes it. */
function asRolesHolder(invitation: TeamInvitation): RolesHolder {
  return {
    userId: null,
    invitationId: invitation.id,
    name: null,
    email: invitation.email,
    avatarUrl: null,
    status: "awaiting_sign_in",
    roles: invitation.roles,
  };
}

export function InvitationsTab({
  setNotice,
  onInvite,
  onViewMember,
}: {
  setNotice?: (message: ToastMessage) => void;
  onInvite: () => void;
  onViewMember: () => void;
}) {
  // One list of every invite; the filter and its counts are worked out
  // here, so switching filters never waits on the network.
  const query = useTeamInvitations("all");
  const { can, canGrantRole, canReadRoles } = useTeamAccess();
  const [filter, setFilter] = useState<Filter>("all");
  const [revoking, setRevoking] = useState<TeamInvitation | null>(null);
  const [editing, setEditing] = useState<TeamInvitation | null>(null);
  const resend = useResendTeamInvitation();
  const revoke = useRevokeTeamInvitation();
  const canInvite = can("team.invite");
  const rolesById = new Map(
    (useTeamRoles({ enabled: canReadRoles }).data?.roles ?? []).map((role) => [
      role.id,
      role,
    ]),
  );

  const invitations = useMemo(
    () => query.data?.pages.flatMap((page) => page.invitations) ?? [],
    [query.data],
  );
  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: invitations.length,
      pending: 0,
      accepted: 0,
      expired: 0,
      revoked: 0,
    };
    for (const invitation of invitations) result[invitation.status] += 1;
    return result;
  }, [invitations]);
  const shown =
    filter === "all"
      ? invitations
      : invitations.filter((invitation) => invitation.status === filter);

  const run = async (action: () => Promise<unknown>, success: string) => {
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

  // Changing or cancelling an invitation hands out or takes back its roles.
  const handles = (invitation: TeamInvitation) =>
    invitation.roles.every((role) => {
      const full = rolesById.get(role.id);
      return full ? canGrantRole(full) : false;
    });

  const menuFor = (invitation: TeamInvitation): RowMenuItem[] => {
    const open =
      invitation.status === "pending" || invitation.status === "expired";
    const mine = canInvite && handles(invitation);
    return [
      ...(invitation.status === "accepted"
        ? [{ label: "View member", icon: User, onSelect: onViewMember }]
        : []),
      ...(mine && invitation.status === "pending"
        ? [
            {
              label: "Change roles",
              icon: PencilSimple,
              onSelect: () => setEditing(invitation),
            },
          ]
        : []),
      ...(mine && invitationState(invitation).isOpen
        ? [
            {
              label: "Resend",
              icon: ArrowClockwise,
              disabled: resend.isPending,
              onSelect: () =>
                void run(
                  () => resend.mutateAsync(invitation.id),
                  `A fresh link was sent to ${invitation.email}.`,
                ),
            },
          ]
        : []),
      ...(mine && open
        ? [
            {
              label: "Revoke",
              icon: XCircle,
              danger: true,
              separated: true,
              onSelect: () => setRevoking(invitation),
            },
          ]
        : []),
    ];
  };

  if (query.isPending) return <ListSkeleton />;

  if (query.isError) {
    return (
      <LoadError
        icon={EnvelopeSimple}
        title="Unable to load invitations"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (invitations.length === 0) {
    return <InvitationsEmpty canInvite={canInvite} onInvite={onInvite} />;
  }

  return (
    <div>
      <FilterBar className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className={`${filterControlClasses} min-w-48`}>
            <ThemedSelect
              id="team-invitation-filter"
              value={filter}
              onValueChange={(value) => setFilter(value as Filter)}
              options={FILTERS.map(({ id, label }): [Filter, string] => [
                id,
                `${label} (${counts[id]})`,
              ])}
              ariaLabel="Filter by status"
              triggerClassName={`${filterSelectTriggerClasses} w-full`}
            />
          </div>
          <p className="text-xs text-(--muted)">
            Links last 7 days. Resending issues a fresh link.
          </p>
        </div>
      </FilterBar>

      <ElevatedCard as="div" className="overflow-hidden">
        <div
          className={`hidden gap-4 px-5 py-3 md:grid ${columns} ${tableHeaderClassName}`}
        >
          <span>Invited</span>
          <span>Roles</span>
          <span>Sent by</span>
          <span>Link</span>
          <span className="sr-only">Actions</span>
        </div>

        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-(--muted)">
            No invitations here.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {shown.map((invitation) => {
              const state = invitationState(invitation);
              const tone = TONES[state.tone];
              return (
                <li
                  key={invitation.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-3.5 transition-colors hover:bg-(--hover) md:items-center md:gap-4 ${columns} ${rowDividerClassName}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-(--border) bg-(--accent)/10 text-(--accent) shadow-xs">
                      <EnvelopeSimple size={16} weight="duotone" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-(--text)">
                        {invitation.email}
                      </span>
                      <span className="mt-0.5 block text-xs text-(--muted)">
                        {sentLabel(invitation.createdAt)}
                      </span>
                    </span>
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <RoleChips roles={invitation.roles} />
                  </div>

                  <span className="col-span-2 truncate text-sm text-(--text-secondary) md:col-span-1">
                    {invitation.invitedBy?.name ?? "—"}
                  </span>

                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className={`font-semibold ${tone.text}`}>
                        {state.label}
                      </span>
                      <span className="text-(--muted)">{state.detail}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--text)_7%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_90%,transparent)]">
                      <div
                        className={`h-full rounded-full ${tone.bar}`}
                        style={{
                          width: `${Math.round(state.progress * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
                    <RowMenu
                      label={`Actions for the invitation to ${invitation.email}`}
                      title={invitation.email}
                      items={menuFor(invitation)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ElevatedCard>

      {query.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className={secondaryButtonClassName}
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}

      {editing ? (
        <EditRolesPanel
          member={asRolesHolder(editing)}
          onClose={() => setEditing(null)}
          setNotice={setNotice}
        />
      ) : null}

      <ConfirmActionModal
        id="team-invitation-revoke"
        isOpen={revoking !== null}
        isPending={revoke.isPending}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          const target = revoking;
          setRevoking(null);
          if (target) {
            void run(
              () => revoke.mutateAsync(target.id),
              `The invitation to ${target.email} is revoked.`,
            );
          }
        }}
        icon={XCircle}
        tone="danger"
        emphasis="cancel"
        title={`Revoke the invitation to ${revoking?.email ?? ""}?`}
        description="The link stops working. You can invite them again later."
        cancelLabel="Keep it"
        confirmLabel="Revoke"
        pendingLabel="Revoking…"
      />
    </div>
  );
}
