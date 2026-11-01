import {
  googleOneTapLoginRequestSchema,
  googleOneTapNonceResponseSchema,
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
          400: errorResponse("The return address is not allowed."),
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
          "Logs in a user with Google or GitHub OAuth, automatically creating an account if not already registered.",
        body: oauthCallbackRequestSchema,
        response: {
          200: jsonResponse("Login successful.", loginResponseSchema),
          400: errorResponse("Authentication failed."),
        },
      },
    },
    controller.login,
  );

  app.post(
    "/auth/oauth/google/nonce",
    {
      // Unauthenticated; each call writes one row to the DB. Cached per
      // tab on the client with in-flight deduplication; rate-limited to 60
      // per minute per IP for shared networks.
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
      schema: {
        operationId: "getGoogleOneTapNonce",
        tags: ["Auth"],
        summary: "Get Google One Tap Nonce",
        description:
          "Generates a single-use cryptographic server nonce for Google One Tap sign-in. Embed the returned nonce in google.accounts.id.initialize() before prompting the user.",
        response: {
          200: jsonResponse(
            "Nonce generated.",
            googleOneTapNonceResponseSchema,
          ),
        },
      },
    },
    controller.getGoogleOneTapNonce,
  );

  app.post(
    "/auth/oauth/google/one-tap",
    {
      // Unauthenticated and each call hits Google + the DB, so cap per IP.
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        operationId: "googleOneTapLogin",
        tags: ["Auth"],
        summary: "Google One Tap login",
        description:
          "Verifies a Google One Tap ID token and logs the user in, creating or linking an account when needed.",
        body: googleOneTapLoginRequestSchema,
        response: {
          200: jsonResponse("Login successful.", loginResponseSchema),
          400: errorResponse("Authentication failed."),
        },
      },
    },
    controller.loginWithGoogleOneTap,
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
