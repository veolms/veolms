import {
  acceptInvitationResponseSchema,
  createTeamInvitationsRequestSchema,
  createTeamInvitationsResponseSchema,
  invitationPreviewSchema,
  invitationTokenParamsSchema,
  teamInvitationListQuerySchema,
  teamInvitationListResponseSchema,
  teamInvitationParamsSchema,
  teamInvitationSchema,
  updateTeamInvitationRequestSchema,
  type CreateTeamInvitationsRequest,
  type Permission,
  type TeamInvitationListQuery,
  type UpdateTeamInvitationRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService, setSignInClaim } from "../../auth/index.ts";
import {
  createAuthorizationGuard,
  createAuthorizationService,
} from "../../authorization/index.ts";
import { createTeamMailer } from "../shared/team.mailer.ts";
import {
  createInvitationLinksService,
  createSignInClaim,
} from "./invitation-links.service.ts";
import { createTeamInvitationsService } from "./invitations.service.ts";

type InvitationParams = { invitationId: string };
type TokenParams = { token: string };

/**
 * Invitations by email (with an Accept link) and add-by-email entries
 * (claimed on first sign-in), plus the public invite link.
 */
const teamInvitationRoutes: RoutePlugin = async (app, options) => {
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
  const requires = (permission: Permission) => [
    ...signedIn,
    guard.authorize(permission, "platform"),
  ];

  const mailer = createTeamMailer({
    database: options.database,
    email: options.services.email,
    log: app.log,
  });
  const invitations = createTeamInvitationsService({
    database: options.database,
    mailer,
  });
  const links = createInvitationLinksService({ database: options.database });
  setSignInClaim(createSignInClaim(links, app.log));

  const actorId = (request: FastifyRequest) => request.user!.id;
  const denied = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Missing permission"),
  };
  const notFound = 404;

  app.get(
    "/team/invitations",
    {
      preHandler: requires("team.read"),
      schema: {
        operationId: "listTeamInvitations",
        tags: ["Team"],
        summary: "List invitations",
        description:
          "Invitations sent with an Accept link, newest first. People added by email show on the members list instead.",
        querystring: teamInvitationListQuerySchema,
        response: {
          200: jsonResponse("Invitations.", teamInvitationListResponseSchema),
          400: errorResponse("Invalid query"),
          ...denied,
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: TeamInvitationListQuery }>) =>
      await invitations.listInvitations(request.query),
  );

  app.post(
    "/team/invitations",
    {
      preHandler: requires("team.invite"),
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "createTeamInvitations",
        tags: ["Team"],
        summary: "Invite or add people by email",
        description:
          "`invite` emails an Accept link. `preapproved` gives the roles on the person's first sign-in with that address (with `notify`, it also tells them). An address that already has a verified account gets the roles at once. Answers per email.",
        body: createTeamInvitationsRequestSchema,
        response: {
          200: jsonResponse(
            "What happened for each email.",
            createTeamInvitationsResponseSchema,
          ),
          400: errorResponse("Invalid request or role"),
          ...denied,
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateTeamInvitationsRequest }>) =>
      await invitations.createInvitations(actorId(request), request.body),
  );

  app.post(
    "/team/invitations/:invitationId/resend",
    {
      preHandler: requires("team.invite"),
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        operationId: "resendTeamInvitation",
        tags: ["Team"],
        summary: "Send an invitation again",
        description:
          "Sends a fresh link (the old one stops working) and gives another 7 days.",
        params: teamInvitationParamsSchema,
        response: {
          200: jsonResponse("The invitation.", teamInvitationSchema),
          ...denied,
          [notFound]: errorResponse("Invitation not found"),
          409: errorResponse("Already accepted or cancelled"),
          429: errorResponse("Sent too recently or too often"),
          502: errorResponse("The email could not be sent"),
        },
      },
    },
    async (request: FastifyRequest<{ Params: InvitationParams }>) =>
      await invitations.resendInvitation(
        actorId(request),
        request.params.invitationId,
      ),
  );

  app.patch(
    "/team/invitations/:invitationId",
    {
      preHandler: requires("team.invite"),
      schema: {
        operationId: "updateTeamInvitation",
        tags: ["Team"],
        summary: "Change the roles of an open invitation",
        params: teamInvitationParamsSchema,
        body: updateTeamInvitationRequestSchema,
        response: {
          200: jsonResponse("The invitation.", teamInvitationSchema),
          400: errorResponse("Invalid role"),
          ...denied,
          [notFound]: errorResponse("Invitation not found"),
          409: errorResponse("Already accepted or cancelled"),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: InvitationParams;
        Body: UpdateTeamInvitationRequest;
      }>,
    ) =>
      await invitations.updateInvitationRoles(
        actorId(request),
        request.params.invitationId,
        request.body.roleIds,
      ),
  );

  app.delete(
    "/team/invitations/:invitationId",
    {
      preHandler: requires("team.invite"),
      schema: {
        operationId: "revokeTeamInvitation",
        tags: ["Team"],
        summary: "Cancel an invitation or add-by-email entry",
        params: teamInvitationParamsSchema,
        response: {
          200: jsonResponse("Cancelled.", z.object({ message: z.string() })),
          ...denied,
          [notFound]: errorResponse("Invitation not found"),
          409: errorResponse("Already accepted or cancelled"),
        },
      },
    },
    async (request: FastifyRequest<{ Params: InvitationParams }>) => {
      await invitations.revokeInvitation(
        actorId(request),
        request.params.invitationId,
      );
      return { message: "Invitation cancelled." };
    },
  );

  app.get(
    "/invitations/:token",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        operationId: "previewInvitation",
        tags: ["Team"],
        summary: "What an invite link offers",
        description:
          "Public. Unknown, expired and cancelled links all answer 404 INVITE_INVALID.",
        params: invitationTokenParamsSchema,
        response: {
          200: jsonResponse("The invitation.", invitationPreviewSchema),
          [notFound]: errorResponse("Link not valid"),
          410: errorResponse("Already accepted"),
        },
      },
    },
    async (request: FastifyRequest<{ Params: TokenParams }>) =>
      await links.preview(request.params.token),
  );

  app.post(
    "/invitations/:token/accept",
    {
      preHandler: signedIn,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        operationId: "acceptInvitation",
        tags: ["Team"],
        summary: "Accept an invitation",
        description:
          "The signed-in account's verified email must be the one invited. Accepting again as the same person changes nothing.",
        params: invitationTokenParamsSchema,
        response: {
          200: jsonResponse(
            "The roles the person now holds from it.",
            acceptInvitationResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Signed in with a different email"),
          [notFound]: errorResponse("Link not valid"),
          410: errorResponse("Already accepted by someone else"),
        },
      },
    },
    async (request: FastifyRequest<{ Params: TokenParams }>) =>
      await links.accept(actorId(request), request.params.token),
  );
};

export default teamInvitationRoutes;
