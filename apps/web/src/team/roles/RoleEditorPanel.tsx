import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  permissionCatalogue,
  TEAM_ROLE_DESCRIPTION_MAX_LENGTH,
  TEAM_ROLE_NAME_MAX_LENGTH,
  type Permission,
  type TeamRole,
} from "@veolms/contracts";
import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { SlideOverFrame } from "../../components/SlideOverPanel";
import {
  useCreateTeamRole,
  useDeleteTeamRole,
  useTeamMembers,
  useTeamRoles,
  useUpdateTeamRole,
} from "../../services/team";
import { ConfirmActionModal } from "../../shell/ConfirmActionModal";
import type { ToastMessage } from "../../ToastNotification";
import {
  countOfferedPermissions,
  initials,
  OFFERED_PERMISSION_COUNT,
  roleLabel,
} from "../teamFormat";
import { chipClassName, inputClassName, SearchField } from "../TeamBits";
import { useTeamAccess } from "../useTeamAccess";
import { PermissionGroup } from "./PermissionGroup";
import { isRequiredByOther, tick, untick } from "./permissionSelection";
import { fuzzyMatches } from "../../lib/fuzzySearch";

export type RoleEditorTarget =
  { mode: "create"; from?: TeamRole } | { mode: "edit"; role: TeamRole };

const TOTAL = OFFERED_PERMISSION_COUNT;
const line = "border-(--border)";

/** Roles a new one can start from: the built-in team roles but admin. */
function templateRoles(roles: readonly TeamRole[]): TeamRole[] {
  return roles.filter(
    (role) => role.isSystem && role.name.toLowerCase() !== "admin",
  );
}

function MemberAvatars({ role }: { role: TeamRole }) {
  const { canReadTeam } = useTeamAccess();
  const members = useTeamMembers("", { enabled: canReadTeam });
  const holders = (members.data?.pages ?? [])
    .flatMap((page) => page.members)
    .filter(
      (member) =>
        member.status === "active" &&
        member.roles.some((held) => held.id === role.id),
    )
    .slice(0, 3);
  return (
    <span className="flex items-center gap-2 text-xs text-(--muted)">
      {holders.length > 0 ? (
        <span className="flex -space-x-1.5">
          {holders.map((member) => (
            <span
              key={member.userId}
              title={member.name ?? member.email}
              className="flex size-6 items-center justify-center rounded-full border-2 border-(--card-surface,var(--surface)) bg-(--accent)/20 text-[0.6rem] font-bold text-(--accent)"
              aria-hidden="true"
            >
              {initials(member.name, member.email)}
            </span>
          ))}
        </span>
      ) : null}
      <span>
        <strong className="text-(--text)">{role.memberCount}</strong>{" "}
        {role.memberCount === 1 ? "member" : "members"}
      </span>
    </span>
  );
}

export function RoleEditorPanel({
  target,
  customRolesEnabled,
  onClose,
  onDuplicate,
  setNotice,
}: {
  target: RoleEditorTarget;
  customRolesEnabled: boolean;
  onClose: () => void;
  onDuplicate: (role: TeamRole) => void;
  setNotice?: (message: ToastMessage) => void;
}) {
  const { can, canEditRole, holdsEverywhere } = useTeamAccess();
  const rolesQuery = useTeamRoles();
  const existing = target.mode === "edit" ? target.role : undefined;
  const source =
    existing ?? (target.mode === "create" ? target.from : undefined);
  const [name, setName] = useState(
    existing
      ? existing.name
      : source
        ? `Copy of ${roleLabel(source.name)}`
        : "",
  );
  const [description, setDescription] = useState(source?.description ?? "");
  const [selected, setSelected] = useState<Set<Permission>>(
    () => new Set(source?.permissions ?? []),
  );
  const [template, setTemplate] = useState<string | null>(source?.id ?? null);
  const [search, setSearch] = useState("");
  const [openAreas, setOpenAreas] = useState<ReadonlySet<string>>(
    () => new Set([permissionCatalogue[0]?.area ?? ""]),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const createRole = useCreateTeamRole();
  const updateRole = useUpdateTeamRole();
  const deleteRole = useDeleteTeamRole();
  const pending = createRole.isPending || updateRole.isPending;

  const readOnly = existing
    ? !canEditRole(existing)
    : !can("role.create") || !customRolesEnabled;
  // A built-in role keeps its name: code and the other roles refer to it.
  const nameLocked = Boolean(existing?.isSystem);
  const canDuplicate =
    Boolean(existing) && customRolesEnabled && can("role.create");
  const canDelete = Boolean(
    existing && !existing.isSystem && can("role.delete"),
  );
  const locked = (key: Permission) => !holdsEverywhere(key);
  const grantable = (keys: readonly Permission[]) =>
    keys.filter((key) => !locked(key));

  const term = search.trim().toLowerCase();
  const groups = useMemo(
    () =>
      permissionCatalogue
        .map((group) => ({
          group,
          entries: term
            ? group.entries.filter((entry) =>
                fuzzyMatches(term, entry.label, entry.help),
              )
            : group.entries,
        }))
        .filter(({ entries }) => entries.length > 0),
    [term],
  );

  const toggleArea = (area: string) =>
    setOpenAreas((current) => {
      const next = new Set(current);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });

  const startFrom = (role: TeamRole | null) => {
    setTemplate(role?.id ?? null);
    setSelected(new Set(role ? grantable(role.permissions) : []));
  };

  const save = async () => {
    setError(null);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      permissions: [...selected],
    };
    try {
      if (existing) {
        await updateRole.mutateAsync({ roleId: existing.id, payload });
        setNotice?.({ type: "success", message: `${payload.name} saved.` });
      } else {
        await createRole.mutateAsync(payload);
        setNotice?.({ type: "success", message: `${payload.name} created.` });
      }
      onClose();
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ?? "Something went wrong.",
      );
    }
  };

  const remove = async () => {
    if (!existing) return;
    try {
      await deleteRole.mutateAsync(existing.id);
      setNotice?.({ type: "success", message: `${existing.name} deleted.` });
      onClose();
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ?? "Something went wrong.",
      );
    } finally {
      setConfirmingDelete(false);
    }
  };

  const title = existing ? roleLabel(existing.name) : "New role";

  return (
    <SlideOverFrame label={title} onClose={onClose} className="max-w-[720px]">
      {/* Header */}
      <div className={`shrink-0 border-b px-6 pt-6 pb-5 ${line}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-(--text)">
              {title}
              {existing?.isSystem ? (
                <span className={`${chipClassName} text-(--muted)!`}>
                  <LockSimple size={11} weight="bold" />
                  Built-in
                </span>
              ) : null}
            </h2>
            {existing && readOnly ? (
              <>
                <p className="mt-1 text-sm text-(--muted)">
                  {existing.description || "No description."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-5">
                  <span className="text-xs text-(--muted)">
                    <strong className="text-sm text-(--text)">
                      {countOfferedPermissions(selected)}
                    </strong>{" "}
                    / {TOTAL} permissions
                  </span>
                  <MemberAvatars role={existing} />
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {!readOnly ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="role-name"
                  className="mb-1.5 block text-sm font-semibold text-(--text)"
                >
                  Name
                </label>
                <input
                  id="role-name"
                  className={inputClassName}
                  value={nameLocked ? roleLabel(name) : name}
                  maxLength={TEAM_ROLE_NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="For example, Support"
                  autoFocus={!existing}
                  readOnly={nameLocked}
                  disabled={nameLocked}
                  aria-describedby={nameLocked ? "role-name-hint" : undefined}
                />
                {nameLocked ? (
                  <p
                    id="role-name-hint"
                    className="mt-1 text-xs text-(--muted)"
                  >
                    Built-in roles keep their name.
                  </p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor="role-description"
                  className="mb-1.5 block text-sm font-semibold text-(--text)"
                >
                  Description
                </label>
                <input
                  id="role-description"
                  className={inputClassName}
                  value={description}
                  maxLength={TEAM_ROLE_DESCRIPTION_MAX_LENGTH}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What this role is for"
                />
              </div>
            </div>

            {!existing ? (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold text-(--text)">
                  Start from
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[null, ...templateRoles(rolesQuery.data?.roles ?? [])].map(
                    (role) => {
                      const active = (role?.id ?? null) === template;
                      return (
                        <button
                          key={role?.id ?? "blank"}
                          type="button"
                          aria-pressed={active}
                          onClick={() => startFrom(role)}
                          className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${active ? "border-(--accent) bg-(--accent)/15 text-(--accent)" : `${line} text-(--muted) hover:text-(--text)`}`}
                        >
                          {role ? roleLabel(role.name) : "Blank"}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-6 mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-(--text)">Permissions</p>
              <p className="text-xs text-(--muted)">
                Ticking one also ticks what it needs
              </p>
            </div>
          </>
        ) : null}

        <div className="mb-3 flex">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Find a permission"
            label="Find a permission"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          {groups.map(({ group, entries }) => (
            <PermissionGroup
              key={group.area}
              group={group}
              entries={entries}
              selected={selected}
              open={Boolean(term) || openAreas.has(group.area)}
              onToggleOpen={() => toggleArea(group.area)}
              readOnly={readOnly}
              isLocked={locked}
              isNeeded={(key) => isRequiredByOther(selected, key)}
              onToggleKey={(key, checked) =>
                setSelected((current) =>
                  checked ? tick(current, [key]) : untick(current, [key]),
                )
              }
              onSelectAll={(keys, checked) =>
                setSelected((current) =>
                  checked
                    ? tick(current, grantable(keys))
                    : untick(current, keys),
                )
              }
            />
          ))}
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-(--muted)">
              No permission matches “{search}”.
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-rose-500">
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-t px-6 py-4 ${line}`}
      >
        {readOnly ? (
          <span className="flex items-center gap-1.5 text-xs text-(--muted)">
            <LockSimple size={13} />
            {existing?.name.toLowerCase() === "admin"
              ? "Admin always holds every permission"
              : existing?.isSystem
                ? "Only an admin can change a built-in role"
                : "You can't edit this role"}
          </span>
        ) : canDelete ? (
          <Button
            elevation="flat"
            motion="static"
            variant="danger"

            onClick={() => setConfirmingDelete(true)}
          >
            <Trash size={15} weight="bold" />
            Delete
          </Button>
        ) : (
          <span className="text-xs text-(--muted)">
            <strong className="text-(--text)">
              {countOfferedPermissions(selected)}
            </strong>{" "}
            of {TOTAL} permissions
          </span>
        )}
        <div className="flex shrink-0 gap-2">
          {readOnly ? (
            <>
              <Button
                elevation="flat"
                motion="static"
                variant="quiet"
                onClick={onClose}
              >
                Close
              </Button>
              {canDuplicate && existing ? (
                <Button
                  elevation="flat"
                  motion="static"
                  onClick={() => onDuplicate(existing)}
                >
                  <Copy size={15} weight="bold" />
                  Duplicate &amp; edit
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                elevation="flat"
                motion="static"
                variant="quiet"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                elevation="flat"
                motion="static"
                disabled={
                  pending || name.trim().length === 0 || selected.size === 0
                }
                onClick={() => void save()}
              >
                {pending ? "Saving…" : existing ? "Save role" : "Create role"}
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmActionModal
        id="team-role-delete"
        isOpen={confirmingDelete}
        isPending={deleteRole.isPending}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void remove()}
        icon={Trash}
        tone="danger"
        emphasis="cancel"
        title={`Delete ${existing?.name ?? "this role"}?`}
        description="Only a role nobody holds, and nobody is invited with, can be deleted."
        cancelLabel="Keep it"
        confirmLabel="Delete"
        pendingLabel="Deleting…"
      />
    </SlideOverFrame>
  );
}
