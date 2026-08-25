import {
  loginResponseSchema,
  oauthCallbackRequestSchema,
  oauthRegisterRequestSchema,
  oauthUrlRequestSchema,
  oauthUrlResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../shared/auth.context.ts";
import { createOauthController } from "./oauth.controller.ts";

const oauthRoutes: RoutePlugin = async (app, options) => {
  const controller = createOauthController(createAuthContext(options));

  app.post(
    "/auth/oauth/url",
    {
      schema: {
        operationId: "getOauthUrl",
        tags: ["Auth"],
        summary: "Get OAuth redirection URL",
        description:
          "Generates the OAuth redirection URL with state and optional PKCE verifier stored in a secure cookie.",
        body: oauthUrlRequestSchema,
        response: {
          200: jsonResponse(
            "URL generated successfully.",
            oauthUrlResponseSchema,
          ),
        },
      },
    },
    controller.getUrl,
  );

  app.post(
    "/auth/oauth/login",
    {
      schema: {
        operationId: "oauthLogin",
        tags: ["Auth"],
        summary: "OAuth Login",
        description:
          "Logs in a user with Google or GitHub OAuth. Fails if user not registered. " +
          "The authorization code is single-use at the provider, so a failed login " +
          "cannot be retried against the registration endpoint with the same code.",
        body: oauthCallbackRequestSchema,
        response: {
          200: jsonResponse("Login successful.", loginResponseSchema),
          400: errorResponse(
            "Authentication failed or account does not exist.",
          ),
        },
      },
    },
    controller.login,
  );

  app.post(
    "/auth/oauth/register",
    {
      schema: {
        operationId: "oauthRegister",
        tags: ["Auth"],
        summary: "OAuth Register",
        description: "Registers a user with Google or GitHub OAuth.",
        body: oauthRegisterRequestSchema,
        response: {
          200: jsonResponse(
            "Existing account linked and logged in.",
            loginResponseSchema,
          ),
          201: jsonResponse("Registration successful.", loginResponseSchema),
          400: errorResponse(
            "Authentication failed, username taken, or account exists.",
          ),
        },
      },
    },
    controller.register,
  );
};

export default oauthRoutes;
