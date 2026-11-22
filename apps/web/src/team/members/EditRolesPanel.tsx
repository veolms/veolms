import { TEAM_TITLE_MAX_LENGTH, type TeamMember } from "@veolms/contracts";
import { useState } from "react";
import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import {
  useSetTeamMemberRoles,
  useSetTeamMemberTitle,
  useUpdateTeamInvitationRoles,
} from "../../services/team";
import { TEAM_DEFAULT_BADGE } from "../teamBadge";
import type { ToastMessage } from "../../ToastNotification";
import { RolePicker } from "../RolePicker";
import {
  FieldLabel,
  inputClassName,
  PanelBody,
  PanelFooter,
  PersonAvatar,
} from "../TeamBits";
import { useTeamAccess } from "../useTeamAccess";

/** Whose roles change: a member, or an invitation not yet taken up. */
export type RolesHolder = Pick<
  TeamMember,
  | "userId"
  | "invitationId"
  | "name"
  | "email"
  | "avatarUrl"
  | "status"
  | "roles"
> & { title?: string | null };

/**
 * Change a member's roles and title, or the roles an invitation will grant.
 * The title is their badge in chat, discussions and profile.
 */
export function EditRolesPanel({
  member,
  onClose,
  setNotice,
}: {
  member: RolesHolder;
  onClose: () => void;
  setNotice?: (message: ToastMessage) => void;
}) {
  const [roleIds, setRoleIds] = useState(member.roles.map((role) => role.id));
  const savedTitle = member.title ?? "";
  const [title, setTitle] = useState(savedTitle);
  const [error, setError] = useState<string | null>(null);
  const { can } = useTeamAccess();
  const setMemberRoles = useSetTeamMemberRoles();
  const setMemberTitle = useSetTeamMemberTitle();
  const updateInvitation = useUpdateTeamInvitationRoles();
  const pending =
    setMemberRoles.isPending ||
    setMemberTitle.isPending ||
    updateInvitation.isPending;
  const rolesChanged =
    roleIds.length !== member.roles.length ||
    roleIds.some((id) => !member.roles.some((role) => role.id === id));
  const titleChanged = title.trim() !== savedTitle.trim();
  const name = member.name || member.email;
  const removes = roleIds.length === 0;
  // Every role taken away is taking them off the team: team.remove's.
  const blocked = removes && (!member.userId || !can("team.remove"));

  const save = async () => {
    setError(null);
    try {
      if (member.userId) {
        if (rolesChanged) {
          await setMemberRoles.mutateAsync({ userId: member.userId, roleIds });
        }
        // Off the team, the title goes too (the server clears it).
        if (titleChanged && !removes) {
          await setMemberTitle.mutateAsync({
            userId: member.userId,
            title: title.trim(),
          });
        }
      } else if (member.invitationId) {
        await updateInvitation.mutateAsync({
          invitationId: member.invitationId,
          roleIds,
        });
      }
      setNotice?.({
        type: "success",
        message:
          member.userId && titleChanged && !rolesChanged
            ? `Title for ${name} saved.`
            : `Roles for ${name} saved.`,
      });
      onClose();
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ?? "Something went wrong.",
      );
    }
  };

  return (
    <SlideOverPanel
      label={`Roles for ${name}`}
      title={member.userId ? "Edit roles and title" : "Change roles"}
      onClose={onClose}
      closeLabel="Close"
    >
      <PanelBody>
        <div className="mb-6 flex items-center gap-3">
          <PersonAvatar
            name={member.name}
            email={member.email}
            avatarUrl={member.avatarUrl}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-(--text)">
              {name}
            </span>
            <span className="block truncate font-mono text-xs text-(--muted)">
              {member.status === "awaiting_sign_in"
                ? "Waiting for first sign-in"
                : member.email}
            </span>
          </span>
        </div>
        {member.userId ? (
          <div className="mb-6">
            <FieldLabel
              htmlFor={`team-title-${member.userId}`}
              hint={`Shown beside their name in chat, discussions and profile. Leave empty to show "${TEAM_DEFAULT_BADGE}".`}
            >
              Title
            </FieldLabel>
            <input
              id={`team-title-${member.userId}`}
              type="text"
              value={title}
              maxLength={TEAM_TITLE_MAX_LENGTH}
              placeholder="e.g. Lead Engineer, Mentor, Teaching Assistant"
              autoComplete="off"
              disabled={removes}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClassName}
            />
            <p className="mt-1 text-right text-xs text-(--muted)">
              {title.trim().length}/{TEAM_TITLE_MAX_LENGTH}
            </p>
          </div>
        ) : null}
        <FieldLabel
          hint={
            member.userId
              ? "Taking every role away takes them off the team."
              : "Pick at least one role."
          }
        >
          Roles
        </FieldLabel>
        <RolePicker
          selected={roleIds}
          onChange={setRoleIds}
          idPrefix={`edit-role-${member.userId ?? member.invitationId}`}
        />
        {error ? (
          <p role="alert" className="mt-4 text-sm text-rose-500">
            {error}
          </p>
        ) : null}
      </PanelBody>
      <PanelFooter>
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
          variant={removes ? "danger" : "primary"}
          disabled={
            pending ||
            blocked ||
            (member.userId ? !rolesChanged && !titleChanged : false)
          }
          onClick={() => void save()}
        >
          {pending
            ? "Saving…"
            : removes
              ? "Remove from team"
              : member.userId
                ? "Save"
                : "Save roles"}
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}
