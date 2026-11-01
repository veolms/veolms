import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { permissionCatalogue, type TeamRole } from "@veolms/contracts";
import { useState } from "react";
import { Button } from "../../components/Button";
import { ElevatedCard } from "../../components/ElevatedCard";
import { useTeamRoles } from "../../services/team";
import type { ToastMessage } from "../../ToastNotification";
import {
  countOfferedPermissions,
  OFFERED_PERMISSION_COUNT,
  roleLabel,
} from "../teamFormat";
import { chipClassName, EmptyState, LoadError } from "../TeamBits";
import { useTeamAccess } from "../useTeamAccess";
import { RoleEditorPanel, type RoleEditorTarget } from "./RoleEditorPanel";

const line = "border-(--border)";

/** Broadest first, as the list in the side column reads. */
const byReach = (a: TeamRole, b: TeamRole) =>
  countOfferedPermissions(b.permissions) -
    countOfferedPermissions(a.permissions) || a.name.localeCompare(b.name);

function RoleListItem({
  role,
  active,
  onSelect,
}: {
  role: TeamRole;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? "bg-(--accent)/12 font-semibold text-(--accent)" : "font-medium text-(--text) hover:bg-(--hover)"}`}
      >
        <span className="truncate">{roleLabel(role.name)}</span>
        <span
          className={`${chipClassName} shrink-0 tabular-nums ${active ? "text-(--accent)!" : "text-(--muted)!"}`}
        >
          {countOfferedPermissions(role.permissions)}
        </span>
      </button>
    </li>
  );
}

/** How much of each area of the catalogue the role holds. */
function AreaBars({ role }: { role: TeamRole }) {
  const held = new Set<string>(role.permissions);
  return (
    <ul className="m-0 grid list-none gap-x-6 gap-y-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {permissionCatalogue.map((group) => {
        const total = group.entries.length;
        const count = group.entries.filter((entry) =>
          held.has(entry.key),
        ).length;
        return (
          <li key={group.area}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-(--text)">
                {group.label}
              </span>
              <span className="font-mono text-[0.7rem] text-(--muted) tabular-nums">
                {count}/{total}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--text)_7%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_90%,transparent)]">
              <div
                className="h-full rounded-full bg-(--accent)"
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RolesTab({
  setNotice,
}: {
  setNotice?: (message: ToastMessage) => void;
}) {
  const rolesQuery = useTeamRoles();
  const { can, canEditRole } = useTeamAccess();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<RoleEditorTarget | null>(null);
  const roles = rolesQuery.data?.roles ?? [];
  const customRolesEnabled = rolesQuery.data?.customRolesEnabled ?? false;
  const canCreate = customRolesEnabled && can("role.create");

  const builtIn = roles.filter((role) => role.isSystem).sort(byReach);
  const custom = roles.filter((role) => !role.isSystem).sort(byReach);
  const selected =
    roles.find((role) => role.id === selectedId) ?? builtIn[0] ?? custom[0];

  if (rolesQuery.isPending) {
    return (
      <div
        className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]"
        aria-busy="true"
      >
        <ElevatedCard as="div" className="h-96 animate-pulse" />
        <ElevatedCard as="div" className="h-64 animate-pulse" />
      </div>
    );
  }

  if (rolesQuery.isError) {
    return (
      <LoadError
        icon={ShieldCheck}
        title="Unable to load roles"
        message={rolesQuery.error.message}
        onRetry={() => void rolesQuery.refetch()}
      />
    );
  }

  if (!selected) return <EmptyState icon={ShieldCheck} title="No roles yet" />;

  const editable = canEditRole(selected);
  const total = OFFERED_PERMISSION_COUNT;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <ElevatedCard as="nav" aria-label="Roles" className="p-2">
        <p className="px-3 pt-2 pb-1.5 text-[11px] font-bold tracking-wider text-(--muted) uppercase">
          Built-in
        </p>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {builtIn.map((role) => (
            <RoleListItem
              key={role.id}
              role={role}
              active={role.id === selected.id}
              onSelect={() => setSelectedId(role.id)}
            />
          ))}
        </ul>

        {custom.length > 0 ? (
          <>
            <p className="px-3 pt-4 pb-1.5 text-[11px] font-bold tracking-wider text-(--muted) uppercase">
              Custom
            </p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {custom.map((role) => (
                <RoleListItem
                  key={role.id}
                  role={role}
                  active={role.id === selected.id}
                  onSelect={() => setSelectedId(role.id)}
                />
              ))}
            </ul>
          </>
        ) : null}

        {canCreate ? (
          <div className={`mt-2 border-t pt-2 ${line}`}>
            <button
              type="button"
              onClick={() => setEditor({ mode: "create" })}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-(--accent) hover:bg-(--hover)"
            >
              <Plus size={14} weight="bold" />
              Custom role
            </button>
          </div>
        ) : null}
      </ElevatedCard>

      <ElevatedCard aria-label={roleLabel(selected.name)} className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-(--text)">
              {roleLabel(selected.name)}
              <span className={`${chipClassName} text-(--muted)!`}>
                {selected.isSystem ? "Built-in" : "Custom"}
              </span>
            </h2>
            <p className="mt-1 text-sm text-(--muted)">
              {selected.description || "No description."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={editable ? "primary" : "quiet"}
              onClick={() => setEditor({ mode: "edit", role: selected })}
            >
              {editable ? (
                <>
                  <PencilSimple size={15} weight="bold" />
                  Edit permissions
                </>
              ) : (
                "View all permissions"
              )}
            </Button>
            {canCreate ? (
              <Button
                variant="quiet"
                onClick={() => setEditor({ mode: "create", from: selected })}
              >
                <Copy size={15} weight="bold" />
                Duplicate
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 mb-6 flex flex-wrap gap-8">
          <span className="text-sm text-(--muted)">
            <strong className="text-2xl font-bold text-(--text)">
              {countOfferedPermissions(selected.permissions)}
            </strong>{" "}
            of {total} permissions
          </span>
          <span className="text-sm text-(--muted)">
            <strong className="text-2xl font-bold text-(--text)">
              {selected.memberCount}
            </strong>{" "}
            {selected.memberCount === 1 ? "member" : "members"}
          </span>
        </div>

        <AreaBars role={selected} />
      </ElevatedCard>

      {editor ? (
        <RoleEditorPanel
          // A new key per target resets the form when Duplicate swaps it.
          key={
            editor.mode === "edit"
              ? editor.role.id
              : `new-${editor.from?.id ?? ""}`
          }
          target={editor}
          customRolesEnabled={customRolesEnabled}
          onClose={() => setEditor(null)}
          onDuplicate={(role) => setEditor({ mode: "create", from: role })}
          setNotice={setNotice}
        />
      ) : null}
    </div>
  );
}
