import { api } from "../../lib/api-client";
import type {
  AcceptInvitationResponse,
  CreateTeamInvitationsRequest,
  CreateTeamInvitationsResponse,
  InvitationPreview,
  TeamInvitation,
  TeamInvitationListQuery,
  TeamInvitationListResponse,
  TeamMemberListQuery,
  TeamMemberListResponse,
  TeamMemberRole,
  TeamRole,
  TeamRoleListResponse,
  TeamRoleUpsertRequest,
  TeamUserSearchResponse,
} from "@veolms/contracts";

const encode = encodeURIComponent;

export const teamService = {
  listRoles: () => api.get<TeamRoleListResponse>("/team/roles"),

  createRole: (payload: TeamRoleUpsertRequest) =>
    api.post<TeamRole>("/team/roles", payload),

  updateRole: (roleId: string, payload: TeamRoleUpsertRequest) =>
    api.patch<TeamRole>(`/team/roles/${encode(roleId)}`, payload),

  deleteRole: (roleId: string) =>
    api.delete<{ message: string }>(`/team/roles/${encode(roleId)}`),

  listMembers: (query: Partial<TeamMemberListQuery>) =>
    api.get<TeamMemberListResponse>("/team/members", { params: query }),

  searchUsers: (q: string) =>
    api.get<TeamUserSearchResponse>("/team/users/search", { params: { q } }),

  setMemberRoles: (userId: string, roleIds: string[]) =>
    api.put<{ roles: TeamMemberRole[] }>(
      `/team/members/${encode(userId)}/roles`,
      { roleIds },
    ),

  removeMember: (userId: string) =>
    api.delete<{ message: string }>(`/team/members/${encode(userId)}`),

  listInvitations: (query: Partial<TeamInvitationListQuery>) =>
    api.get<TeamInvitationListResponse>("/team/invitations", {
      params: query,
    }),

  createInvitations: (payload: CreateTeamInvitationsRequest) =>
    api.post<CreateTeamInvitationsResponse>("/team/invitations", payload),

  resendInvitation: (invitationId: string) =>
    api.post<TeamInvitation>(
      `/team/invitations/${encode(invitationId)}/resend`,
    ),

  updateInvitationRoles: (invitationId: string, roleIds: string[]) =>
    api.patch<TeamInvitation>(`/team/invitations/${encode(invitationId)}`, {
      roleIds,
    }),

  revokeInvitation: (invitationId: string) =>
    api.delete<{ message: string }>(
      `/team/invitations/${encode(invitationId)}`,
    ),

  previewInvitation: (token: string) =>
    api.get<InvitationPreview>(`/invitations/${encode(token)}`),

  acceptInvitation: (token: string) =>
    api.post<AcceptInvitationResponse>(`/invitations/${encode(token)}/accept`),
};
