import type {
  OauthCallbackRequest,
  OauthProvider,
  OauthRegisterRequest,
} from "@veolms/contracts";

import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import { OAUTH_STATE_COOKIE } from "../shared/auth.constants.ts";
import type { SessionUser } from "../shared/auth.types.ts";
import { generatePkce, generateRandomToken } from "../shared/auth.utils.ts";
import {
  fetchOauthProfile,
  verifyOauthState,
  type OauthProfile,
  type OauthProviderName,
} from "./oauth.provider.ts";
import type { AuthService } from "../authentication/authentication.service.ts";
import type { SessionService } from "../session/session.service.ts";

const ALLOW_MOCK_OAUTH =
  config.NODE_ENV === "development" && config.OAUTH_ALLOW_MOCK_CODES;

export interface OauthServiceOptions {
  authService: AuthService;
  sessionService: SessionService;
}

export function createOauthService({
  authService,
  sessionService,
}: OauthServiceOptions) {
  const credentials = {
    googleClientId: config.GOOGLE_CLIENT_ID,
    googleClientSecret: config.GOOGLE_CLIENT_SECRET,
    githubClientId: config.GITHUB_CLIENT_ID,
    githubClientSecret: config.GITHUB_CLIENT_SECRET,
  };

  function getPublicConfig() {
    return {
      googleClientId: config.GOOGLE_CLIENT_ID || "",
      githubClientId: config.GITHUB_CLIENT_ID || "",
    };
  }

  function createAuthorizationUrl(
    provider: OauthProvider,
    redirectUri: string,
  ) {
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

    return {
      url,
      state,
      cookie: {
        state,
        provider,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      },
    };
  }

  async function resolveCallbackProfile(
    request: OauthCallbackRequest,
    cookieValue: string | undefined,
    onStateValidated?: () => void,
  ): Promise<OauthProfile> {
    const oauthCode = request.code || request.token;

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
        cookieValue,
        provider: request.provider,
        state: request.state,
      }));
      onStateValidated?.();
    }

    const profile = await fetchOauthProfile({
      provider: request.provider,
      code: oauthCode,
      redirectUri: request.redirectUri,
      codeVerifier,
      credentials,
      allowMockCodes: ALLOW_MOCK_OAUTH,
    });

    return profile;
  }

  async function login(
    provider: OauthProviderName,
    profile: OauthProfile,
    request: { ip: string; userAgent: string | null },
  ) {
    let user: SessionUser | undefined =
      await authService.findUserByOauthAccount(
        provider,
        profile.providerUserId,
      );

    if (!user) {
      const existingUser =
        (await authService.findVerifiedUserByEmail(profile.email)) ||
        (await authService.findUserByIdentifier(profile.email, "email"));

      if (existingUser) {
        await authService.linkOauthAccount({
          userId: existingUser.id,
          provider,
          providerUserId: profile.providerUserId,
        });
        user = existingUser;
      } else {
        const localPart = profile.email.split("@")[0] || "oauth_user";
        const username = await authService.generateUniqueUsername(
          profile.username || localPart,
        );
        const userId = await authService.createUser({
          email: profile.email,
          phoneNo: null,
          username,
          displayName: profile.name || localPart,
          emailVerified: true,
          oauth: { provider, providerUserId: profile.providerUserId },
        });
        user = await authService.requireUser(userId);
      }
    }

    const session = await sessionService.establishSession(user, request);
    const rbac = await authService.getUserRbac(user.id);
    return { user: { ...user, ...rbac }, session };
  }

  async function register(
    request: OauthRegisterRequest,
    profile: OauthProfile,
    requestMeta: { ip: string; userAgent: string | null },
  ) {
    const provider: OauthProviderName = request.provider;

    if (
      await authService.oauthAccountExists(provider, profile.providerUserId)
    ) {
      throw new AppError(
        400,
        "LOGIN_REQUIRED",
        `A ${provider} account is already registered. Please log in instead.`,
      );
    }

    let user: SessionUser | undefined =
      (await authService.findVerifiedUserByEmail(profile.email)) ||
      (await authService.findUserByIdentifier(profile.email, "email"));

    let statusCode: 200 | 201 = 200;

    if (user) {
      await authService.linkOauthAccount({
        userId: user.id,
        provider,
        providerUserId: profile.providerUserId,
      });
    } else {
      statusCode = 201;
      const localPart = profile.email.split("@")[0] || "oauth_user";
      const username = await authService.generateUniqueUsername(
        request.username || profile.username || localPart,
      );
      const userId = await authService.createUser({
        email: profile.email,
        phoneNo: null,
        username,
        displayName: request.displayName || profile.name || localPart,
        emailVerified: true,
        oauth: { provider, providerUserId: profile.providerUserId },
      });
      user = await authService.requireUser(userId);
    }

    const session = await sessionService.establishSession(
      user,
      requestMeta,
    );
    const rbac = await authService.getUserRbac(user.id);
    return { statusCode, user: { ...user, ...rbac }, session };
  }

  return {
    getPublicConfig,
    createAuthorizationUrl,
    resolveCallbackProfile,
    login,
    register,
    oauthStateCookieName: OAUTH_STATE_COOKIE,
  };
}

export type OauthService = ReturnType<typeof createOauthService>;
