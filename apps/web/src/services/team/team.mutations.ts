import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptInvitationResponse,
  CreateTeamInvitationsRequest,
  CreateTeamInvitationsResponse,
  TeamInvitation,
  TeamMemberRole,
  TeamRole,
  TeamRoleUpsertRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authKeys } from "../auth/auth.keys";
import { authorizationKeys } from "../authorization/authorization.keys";
import { teamKeys } from "./team.keys";
import { teamService } from "./team.service";

/**
 * Any team change can change what someone (the signed-in person included)
 * may do, so every mutation refreshes the team lists, the capabilities, and
 * the signed-in account, whose role names pick the menu and the admin view.
 */
function useTeamInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: teamKeys.all }),
      queryClient.invalidateQueries({ queryKey: authorizationKeys.all }),
      queryClient.invalidateQueries({ queryKey: authKeys.me() }),
    ]);
}

export function useCreateTeamRole() {
  const invalidate = useTeamInvalidation();
  return useMutation<TeamRole, ApiError, TeamRoleUpsertRequest>({
    mutationFn: (payload) => teamService.createRole(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateTeamRole() {
  const invalidate = useTeamInvalidation();
  return useMutation<
    TeamRole,
    ApiError,
    { roleId: string; payload: TeamRoleUpsertRequest }
  >({
    mutationFn: ({ roleId, payload }) =>
      teamService.updateRole(roleId, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTeamRole() {
  const invalidate = useTeamInvalidation();
  return useMutation<{ message: string }, ApiError, string>({
    mutationFn: (roleId) => teamService.deleteRole(roleId),
    onSuccess: invalidate,
  });
}

export function useSetTeamMemberRoles() {
  const invalidate = useTeamInvalidation();
  return useMutation<
    { roles: TeamMemberRole[] },
    ApiError,
    { userId: string; roleIds: string[] }
  >({
    mutationFn: ({ userId, roleIds }) =>
      teamService.setMemberRoles(userId, roleIds),
    onSuccess: invalidate,
  });
}

export function useRemoveTeamMember() {
  const invalidate = useTeamInvalidation();
  return useMutation<{ message: string }, ApiError, string>({
    mutationFn: (userId) => teamService.removeMember(userId),
    onSuccess: invalidate,
  });
}

export function useCreateTeamInvitations() {
  const invalidate = useTeamInvalidation();
  return useMutation<
    CreateTeamInvitationsResponse,
    ApiError,
    CreateTeamInvitationsRequest
  >({
    mutationFn: (payload) => teamService.createInvitations(payload),
    onSuccess: invalidate,
  });
}

export function useResendTeamInvitation() {
  const invalidate = useTeamInvalidation();
  return useMutation<TeamInvitation, ApiError, string>({
    mutationFn: (invitationId) => teamService.resendInvitation(invitationId),
    onSuccess: invalidate,
  });
}

export function useUpdateTeamInvitationRoles() {
  const invalidate = useTeamInvalidation();
  return useMutation<
    TeamInvitation,
    ApiError,
    { invitationId: string; roleIds: string[] }
  >({
    mutationFn: ({ invitationId, roleIds }) =>
      teamService.updateInvitationRoles(invitationId, roleIds),
    onSuccess: invalidate,
  });
}

export function useRevokeTeamInvitation() {
  const invalidate = useTeamInvalidation();
  return useMutation<{ message: string }, ApiError, string>({
    mutationFn: (invitationId) => teamService.revokeInvitation(invitationId),
    onSuccess: invalidate,
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation<AcceptInvitationResponse, ApiError, string>({
    mutationFn: (token) => teamService.acceptInvitation(token),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: authorizationKeys.all }),
        // The session's roles changed; /auth/me answers with them.
        queryClient.invalidateQueries({ queryKey: ["auth"] }),
      ]),
  });
}
