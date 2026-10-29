import type { TeamMember } from "@veolms/contracts";
import { useState } from "react";
import { Button } from "../../components/Button";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import {
  useSetTeamMemberRoles,
  useUpdateTeamInvitationRoles,
} from "../../services/team";
import type { ToastMessage } from "../../ToastNotification";
import { RolePicker } from "../RolePicker";
import { FieldLabel, PanelBody, PanelFooter, PersonAvatar } from "../TeamBits";
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
>;

/** Change a member's roles, or those an invitation will grant. */
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
  const [error, setError] = useState<string | null>(null);
  const { can } = useTeamAccess();
  const setMemberRoles = useSetTeamMemberRoles();
  const updateInvitation = useUpdateTeamInvitationRoles();
  const pending = setMemberRoles.isPending || updateInvitation.isPending;
  const name = member.name || member.email;
  const removes = roleIds.length === 0;
  // Every role taken away is taking them off the team: team.remove's.
  const blocked = removes && (!member.userId || !can("team.remove"));

  const save = async () => {
    setError(null);
    try {
      if (member.userId) {
        await setMemberRoles.mutateAsync({ userId: member.userId, roleIds });
      } else if (member.invitationId) {
        await updateInvitation.mutateAsync({
          invitationId: member.invitationId,
          roleIds,
        });
      }
      setNotice?.({ type: "success", message: `Roles for ${name} saved.` });
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
      title="Change roles"
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
          disabled={pending || blocked}
          onClick={() => void save()}
        >
          {pending ? "Saving…" : removes ? "Remove from team" : "Save roles"}
        </Button>
      </PanelFooter>
    </SlideOverPanel>
  );
}
