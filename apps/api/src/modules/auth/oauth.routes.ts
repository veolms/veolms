import crypto from "node:crypto";

import {
  loginResponseSchema,
  oauthCallbackRequestSchema,
  oauthRegisterRequestSchema,
  oauthUrlRequestSchema,
  oauthUrlResponseSchema,
} from "@veolms/contracts";
import type { z } from "zod";

import { config } from "../../config.ts";
import { AppError, errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { OAUTH_STATE_COOKIE } from "./auth.constants.ts";
import { createAuthContext } from "./auth.context.ts";
import {
  clearOauthStateCookie,
  setOauthStateCookie,
  setSessionCookie,
} from "./auth.cookies.ts";
import { presentLogin } from "./auth.presenters.ts";
import * as repository from "./auth.repository.ts";
import { generatePkce, generateRandomToken } from "./auth.utils.ts";
import {
  fetchOauthProfile,
  verifyOauthState,
  type OauthProfile,
  type OauthProviderName,
} from "./oauth.provider.ts";

/**
 * Mock OAuth codes short-circuit the provider round-trip *and* the state/CSRF
 * check, so they are gated on an explicit opt-in rather than on `NODE_ENV`.
 *
 * `NODE_ENV` defaults to `development`, which means a deployment that simply
 * forgets to set it would otherwise accept `mock_<any-email>` as proof of
 * identity for an arbitrary address.
 */
const ALLOW_MOCK_OAUTH =
  config.NODE_ENV === "development" && config.OAUTH_ALLOW_MOCK_CODES;

const oauthRoutes: RoutePlugin = async (app, options) => {
  const { service } = createAuthContext(options);
  const { database } = options;

  const credentials = {
    googleClientId: config.GOOGLE_CLIENT_ID,
    googleClientSecret: config.GOOGLE_CLIENT_SECRET,
    githubClientId: config.GITHUB_CLIENT_ID,
    githubClientSecret: config.GITHUB_CLIENT_SECRET,
  };

  /**
   * Runs the half of the callback that login and registration share: CSRF state
   * validation followed by the single-use code exchange.
   */
  async function resolveCallbackProfile(
    request: {
      body: z.infer<typeof oauthCallbackRequestSchema>;
      cookies: Record<string, string | undefined>;
    },
    reply: { clearCookie: (name: string, opts: { path: string }) => unknown },
  ): Promise<OauthProfile> {
    const { provider, code, token, state, redirectUri } = request.body;
    const oauthCode = code || token;

    if (!oauthCode) {
      throw new AppError(
        400,
        "CODE_REQUIRED",
        "OAuth code or token is required.",
      );
    }

    const isMock = ALLOW_MOCK_OAUTH && oauthCode.startsWith("mock_");
    let codeVerifier: string | undefined;

    if (!isMock) {
      ({ codeVerifier } = verifyOauthState({
        cookieValue: request.cookies[OAUTH_STATE_COOKIE],
        provider,
        state,
      }));

      clearOauthStateCookie(reply as never);
    }

    return fetchOauthProfile({
      provider,
      code: oauthCode,
      redirectUri,
      codeVerifier,
      credentials,
      allowMockCodes: ALLOW_MOCK_OAUTH,
    });
  }

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
    async (request, reply) => {
      const { provider, redirectUri } = request.body;
      const state = generateRandomToken();

      let url: string;
      let codeVerifier: string | undefined;

      if (provider === "google") {
        const pkce = generatePkce();
        codeVerifier = pkce.verifier;
        url =
          "https://accounts.google.com/o/oauth2/v2/auth?" +
          new URLSearchParams({
            client_id: config.GOOGLE_CLIENT_ID || "",
            redirect_uri: redirectUri,
            state,
            response_type: "code",
            scope: "openid profile email",
            code_challenge: pkce.challenge,
            code_challenge_method: "S256",
          }).toString();
      } else {
        url =
          "https://github.com/login/oauth/authorize?" +
          new URLSearchParams({
            client_id: config.GITHUB_CLIENT_ID || "",
            redirect_uri: redirectUri,
            state,
            scope: "user:email",
          }).toString();
      }

      setOauthStateCookie(reply, {
        state,
        provider,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      });

      return { url, state };
    },
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
    async (request, reply) => {
      const profile = await resolveCallbackProfile(request, reply);

      let user = await repository.findUserByOauthAccount(
        database,
        request.body.provider,
        profile.providerUserId,
      );

      if (!user) {
        // Fallback: check if a user with this verified email already exists
        // (e.g. registered via email+OTP). Auto-link the OAuth provider.
        const existingUser = await repository.findVerifiedUserByEmail(
          database,
          profile.email,
        );

        if (!existingUser) {
          throw new AppError(
            400,
            "REGISTRATION_REQUIRED",
            "Please register first using your Google or GitHub account.",
          );
        }

        await repository.insertOauthAccount(database, {
          id: crypto.randomUUID(),
          userId: existingUser.id,
          provider: request.body.provider,
          providerUserId: profile.providerUserId,
        });

        user = existingUser;
      }

      const session = await service.establishSession(user, {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      setSessionCookie(reply, session.token);
      return presentLogin(user, session.mfa);
    },
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
    async (request, reply) => {
      const provider: OauthProviderName = request.body.provider;
      const profile = await resolveCallbackProfile(request, reply);

      if (
        await repository.oauthAccountExists(
          database,
          provider,
          profile.providerUserId,
        )
      ) {
        throw new AppError(
          400,
          "LOGIN_REQUIRED",
          `A ${provider} account is already registered. Please log in instead.`,
        );
      }

      // If a verified account with this email already exists (e.g. registered
      // via email+OTP), auto-link the OAuth provider and log in directly.
      const existingUser = await repository.findVerifiedUserByEmail(
        database,
        profile.email,
      );

      if (existingUser) {
        await repository.insertOauthAccount(database, {
          id: crypto.randomUUID(),
          userId: existingUser.id,
          provider,
          providerUserId: profile.providerUserId,
        });

        const session = await service.establishSession(existingUser, {
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        setSessionCookie(reply, session.token);
        reply.code(200);
        return presentLogin(existingUser, session.mfa);
      }

      const localPart = profile.email.split("@")[0] || "oauth_user";
      const username = await service.generateUniqueUsername(
        request.body.username || profile.username || localPart,
      );

      const userId = await service.createUser({
        email: profile.email,
        phoneNo: null,
        username,
        displayName: request.body.displayName || profile.name || localPart,
        emailVerified: true,
        oauth: { provider, providerUserId: profile.providerUserId },
      });

      const user = await service.requireUser(userId);
      const session = await service.establishSession(user, {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      setSessionCookie(reply, session.token);
      reply.code(201);
      return presentLogin(user, session.mfa);
    },
  );
};

export default oauthRoutes;
