import {
  setTeamMemberRolesRequestSchema,
  teamMemberListQuerySchema,
  teamMemberListResponseSchema,
  teamMemberParamsSchema,
  teamMemberRoleSchema,
  teamRoleListResponseSchema,
  teamRoleParamsSchema,
  teamRoleSchema,
  teamRoleUpsertRequestSchema,
  teamUserSearchQuerySchema,
  teamUserSearchResponseSchema,
  type Permission,
} from "@veolms/contracts";
import { z } from "zod";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import {
  createAuthorizationGuard,
  createAuthorizationService,
} from "../authorization/index.ts";
import { createTeamMembersService } from "./members/members.service.ts";
import {
  createTeamRolesService,
  CUSTOM_ROLES_FEATURE,
} from "./roles/roles.service.ts";
import { createTeamMailer } from "./shared/team.mailer.ts";
import { createTeamController } from "./team.controller.ts";

const messageSchema = z.object({ message: z.string() });

/**
 * Team management: roles built from permissions, and the people holding
 * them. Invitations live in invitations/invitations.routes.ts.
 */
const teamRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const guard = createAuthorizationGuard(
    createAuthorizationService(options.database),
  );
  const signedIn = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const requires = (permission: Permission, featureKey?: string) => [
    ...signedIn,
    guard.authorize(permission, "platform", featureKey),
  ];

  const mailer = createTeamMailer({
    database: options.database,
    email: options.services.email,
    log: app.log,
  });
  const controller = createTeamController({
    roles: createTeamRolesService({ database: options.database }),
    members: createTeamMembersService({ database: options.database, mailer }),
  });

  const denied = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Missing permission"),
  };

  app.get(
    "/team/roles",
    {
      preHandler: requires("role.read"),
      schema: {
        operationId: "listTeamRoles",
        tags: ["Team"],
        summary: "List team roles",
        description:
          "Every role except student, with its permissions and how many people hold it.",
        response: {
          200: jsonResponse("Roles.", teamRoleListResponseSchema),
          ...denied,
        },
      },
    },
    controller.listRoles,
  );

  app.post(
    "/team/roles",
    {
      preHandler: requires("role.create", CUSTOM_ROLES_FEATURE),
      schema: {
        operationId: "createTeamRole",
        tags: ["Team"],
        summary: "Create a custom role",
        description:
          "Permissions the chosen ones need are added. You can only include permissions you hold.",
        body: teamRoleUpsertRequestSchema,
        response: {
          200: jsonResponse("The new role.", teamRoleSchema),
          400: errorResponse("Invalid role"),
          ...denied,
          409: errorResponse("Name taken"),
        },
      },
    },
    controller.createRole,
  );

  app.patch(
    "/team/roles/:roleId",
    {
      preHandler: requires("role.update"),
      schema: {
        operationId: "updateTeamRole",
        tags: ["Team"],
        summary: "Change a custom role",
        params: teamRoleParamsSchema,
        body: teamRoleUpsertRequestSchema,
        response: {
          200: jsonResponse("The role after the change.", teamRoleSchema),
          400: errorResponse("Invalid role"),
          ...denied,
          404: errorResponse("Role not found"),
          409: errorResponse("Built-in role or name taken"),
        },
      },
    },
    controller.updateRole,
  );

  app.delete(
    "/team/roles/:roleId",
    {
      preHandler: requires("role.delete"),
      schema: {
        operationId: "deleteTeamRole",
        tags: ["Team"],
        summary: "Delete a custom role nobody holds",
        params: teamRoleParamsSchema,
        response: {
          200: jsonResponse("Deleted.", messageSchema),
          ...denied,
          404: errorResponse("Role not found"),
          409: errorResponse("Built-in role or role in use"),
        },
      },
    },
    controller.deleteRole,
  );

  app.get(
    "/team/members",
    {
      preHandler: requires("team.read"),
      schema: {
        operationId: "listTeamMembers",
        tags: ["Team"],
        summary: "List team members",
        description:
          "People holding a team role, newest first. The first page also lists people added by email who have not signed in yet.",
        querystring: teamMemberListQuerySchema,
        response: {
          200: jsonResponse("Members.", teamMemberListResponseSchema),
          400: errorResponse("Invalid query"),
          ...denied,
        },
      },
    },
    controller.listMembers,
  );

  app.get(
    "/team/users/search",
    {
      preHandler: requires("role.assign"),
      schema: {
        operationId: "searchTeamCandidates",
        tags: ["Team"],
        summary: "Find accounts to add to the team",
        querystring: teamUserSearchQuerySchema,
        response: {
          200: jsonResponse("Up to 10 accounts.", teamUserSearchResponseSchema),
          400: errorResponse("Invalid query"),
          ...denied,
        },
      },
    },
    controller.searchUsers,
  );

  app.put(
    "/team/members/:userId/roles",
    {
      preHandler: requires("role.assign"),
      schema: {
        operationId: "setTeamMemberRoles",
        tags: ["Team"],
        summary: "Set a person's team roles",
        description:
          "Replaces every team role the person holds. Puts someone on the team, changes their roles, or (with an empty list) takes them off it.",
        params: teamMemberParamsSchema,
        body: setTeamMemberRolesRequestSchema,
        response: {
          200: jsonResponse(
            "The person's team roles now.",
            z.object({ roles: z.array(teamMemberRoleSchema) }),
          ),
          400: errorResponse("Invalid role"),
          ...denied,
          404: errorResponse("User not found"),
          409: errorResponse("Last admin or own access"),
        },
      },
    },
    controller.setMemberRoles,
  );

  app.delete(
    "/team/members/:userId",
    {
      preHandler: requires("team.remove"),
      schema: {
        operationId: "removeTeamMember",
        tags: ["Team"],
        summary: "Take someone off the team",
        description: "They keep their account and stay a learner.",
        params: teamMemberParamsSchema,
        response: {
          200: jsonResponse("Removed.", messageSchema),
          ...denied,
          404: errorResponse("User not found"),
          409: errorResponse("Last admin or own access"),
        },
      },
    },
    controller.removeMember,
  );
};

export default teamRoutes;
