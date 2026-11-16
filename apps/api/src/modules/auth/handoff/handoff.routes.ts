import {
  loginResponseSchema,
  signInHandoffRequestSchema,
  type SignInHandoffRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import { acceptTextJsonBody } from "../../../lib/text-json-body.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { SESSION_COOKIE } from "../shared/auth.constants.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { setSessionCookie } from "../shared/auth.cookies.ts";
import { presentLogin } from "../shared/auth.presenters.ts";
import { requestLocation } from "../shared/request-location.ts";
import { createHandoffService } from "./handoff.service.ts";

const handoffRoutes: RoutePlugin = async (app, options) => {
  const { authService, sessionService } = createAuthContext(options);
  const service = createHandoffService({ authService, sessionService });

  app.post(
    "/auth/handoff",
    {
      // Sent as sign-in requests are, as text/plain (no CORS preflight).
      preValidation: acceptTextJsonBody,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        operationId: "signInWithHandoff",
        tags: ["Auth"],
        summary: "Sign in someone handed over from another site",
        description:
          "Spends a one-time token issued by another site of the same deployment (an academy's launch) and signs its person in. Answers 404 where the site takes no hand-overs.",
        body: signInHandoffRequestSchema,
        response: {
          200: jsonResponse("Signed in.", loginResponseSchema),
          401: errorResponse("The token is unknown, spent or expired."),
          403: errorResponse("The account is deactivated."),
          404: errorResponse("This site takes no hand-overs."),
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: SignInHandoffRequest }>,
      reply: FastifyReply,
    ) => {
      const result = await service.signIn(request.body.token, {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        location: requestLocation(request.headers),
        existingSessionToken: request.cookies[SESSION_COOKIE] ?? null,
      });
      setSessionCookie(reply, result.session.token);
      return presentLogin(result.user, result.session.mfa);
    },
  );
};

export default handoffRoutes;
