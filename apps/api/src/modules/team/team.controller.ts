import type {
  SetTeamMemberRolesRequest,
  TeamMemberListQuery,
  TeamRoleUpsertRequest,
  TeamUserSearchQuery,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import type { TeamMembersService } from "./members/members.service.ts";
import type { TeamRolesService } from "./roles/roles.service.ts";

type RoleParams = { roleId: string };
type MemberParams = { userId: string };

export function createTeamController({
  roles,
  members,
}: {
  roles: TeamRolesService;
  members: TeamMembersService;
}) {
  // Every team route runs after authentication, so the user is present.
  const actorId = (request: FastifyRequest) => request.user!.id;

  return {
    listRoles: async () => await roles.listRoles(),

    createRole: async (
      request: FastifyRequest<{ Body: TeamRoleUpsertRequest }>,
    ) => await roles.createRole(actorId(request), request.body),

    updateRole: async (
      request: FastifyRequest<{
        Params: RoleParams;
        Body: TeamRoleUpsertRequest;
      }>,
    ) =>
      await roles.updateRole(
        actorId(request),
        request.params.roleId,
        request.body,
      ),

    deleteRole: async (request: FastifyRequest<{ Params: RoleParams }>) => {
      await roles.deleteRole(actorId(request), request.params.roleId);
      return { message: "Role deleted." };
    },

    listMembers: async (
      request: FastifyRequest<{ Querystring: TeamMemberListQuery }>,
    ) => await members.listMembers(request.query),

    searchUsers: async (
      request: FastifyRequest<{ Querystring: TeamUserSearchQuery }>,
    ) => await members.searchUsers(request.query.q),

    setMemberRoles: async (
      request: FastifyRequest<{
        Params: MemberParams;
        Body: SetTeamMemberRolesRequest;
      }>,
    ) =>
      await members.setMemberRoles(
        actorId(request),
        request.params.userId,
        request.body.roleIds,
      ),

    removeMember: async (request: FastifyRequest<{ Params: MemberParams }>) => {
      await members.setMemberRoles(actorId(request), request.params.userId, []);
      return { message: "Removed from the team." };
    },
  };
}
