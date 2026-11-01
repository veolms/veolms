import type {
  OauthCallbackRequest,
  OauthProvider,
  OauthRegisterRequest,
} from "@veolms/contracts";
import { createCorsMatcher } from "@veolms/api-core";

import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import { OAUTH_STATE_COOKIE } from "../shared/auth.constants.ts";
import type { AuthLogger, SessionUser } from "../shared/auth.types.ts";
import {
  generatePkce,
  generateRandomToken,
  hashToken,
} from "../shared/auth.utils.ts";
import {
  fetchOauthProfile,
  normalizeOauthProfile,
  verifyGoogleIdToken,
  verifyOauthState,
  type OauthProfile,
  type OauthProviderName,
} from "./oauth.provider.ts";
import { consumeOauthNonce, insertOauthNonce } from "./oauth.repository.ts";
import type { AuthService } from "../authentication/authentication.service.ts";
import type { SessionService } from "../session/session.service.ts";
import { type SessionLocation } from "../shared/request-location.ts";
import type { Executor } from "../shared/repository.types.ts";

const ALLOW_MOCK_OAUTH =
  config.NODE_ENV === "development" && config.OAUTH_ALLOW_MOCK_CODES;

const corsMatcher = createCorsMatcher(config);

/**
 * The address the provider sends the visitor back to must be a page of this
 * platform's own web app: an http(s) URL on an origin the API already
 * accepts requests from. The provider checks the address against its own
 * list too; this stops the API handing out a sign-in link to anywhere else.
 */
function assertAllowedRedirectUri(
  redirectUri: string,
  logger?: AuthLogger,
): void {
  let url: URL | undefined;
  try {
    url = new URL(redirectUri);
  } catch {
    url = undefined;
  }

  if (
    !url ||
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !corsMatcher.isAllowedOrigin(url.origin)
  ) {
    // An operator who serves the web app from an origin missing from
    // WEB_URL / CORS_ORIGINS sees why social sign-in stopped there.
    logger?.warn(
      { origin: url?.origin ?? null },
      "Refused an OAuth return address outside the allowed origins",
    );
    throw new AppError(
      400,
      "INVALID_REDIRECT_URI",
      "This sign-in return address is not allowed.",
    );
  }
}

function assertAccountActive(user: SessionUser | undefined): void {
  if (user?.is_deleted) {
    throw new AppError(
      403,
      "ACCOUNT_DEACTIVATED",
      "This account has been deactivated.",
    );
  }
}

export interface OauthServiceOptions {
  database: Executor;
  authService: AuthService;
  sessionService: SessionService;
}

export function createOauthService({
  database,
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
    };
  }

  function createAuthorizationUrl(
    provider: OauthProvider,
    redirectUri: string,
    logger?: AuthLogger,
  ) {
    assertAllowedRedirectUri(redirectUri, logger);

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
    logger?: AuthLogger,
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
      logger,
    });

    return profile;
  }

  /** One-hour window - users may leave the One Tap prompt on screen a while. */
  const ONE_TAP_NONCE_TTL_MS = 60 * 60 * 1_000;

  async function createGoogleOneTapNonce() {
    const nonce = generateRandomToken();
    const tokenHash = hashToken(nonce);
    const expiresAt = new Date(Date.now() + ONE_TAP_NONCE_TTL_MS);
    await insertOauthNonce(database, tokenHash, expiresAt);
    return { nonce, expiresAt };
  }

  async function loginWithGoogleCredential(
    credential: string,
    request: {
      ip: string;
      userAgent: string | null;
      existingSessionToken?: string | null;
      location?: SessionLocation | null;
    },
    verify: (credential: string) => Promise<OauthProfile> = (value) =>
      verifyGoogleIdToken(value, config.GOOGLE_CLIENT_ID || ""),
  ) {
    const profile = await verify(credential);

    // Reject tokens that were not initialised with a server-issued nonce.
    if (!profile.nonce) {
      throw new AppError(
        401,
        "ONE_TAP_NONCE_INVALID",
        "This sign-in prompt has expired. Please try again.",
      );
    }
    const tokenHash = hashToken(profile.nonce);
    const consumed = await consumeOauthNonce(database, tokenHash, new Date());
    if (!consumed) {
      throw new AppError(
        401,
        "ONE_TAP_NONCE_INVALID",
        "This sign-in prompt has expired. Please try again.",
      );
    }

    return login("google", profile, request);
  }

  async function login(
    provider: OauthProviderName,
    providerProfile: OauthProfile,
    request: {
      ip: string;
      userAgent: string | null;
      existingSessionToken?: string | null;
      location?: SessionLocation | null;
    },
  ) {
    // Every lookup and the account created below use the stored form of the
    // address. The providers' own functions already return it that way; a
    // profile can also reach here from a caller's own verifier.
    const profile = normalizeOauthProfile(providerProfile);
    let user: SessionUser | undefined =
      await authService.findUserByOauthAccountIncludingDeleted(
        provider,
        profile.providerUserId,
      );
    let shouldSyncProviderAvatar = Boolean(user);
    assertAccountActive(user);

    if (!user) {
      const existingUser =
        (await authService.findVerifiedUserByEmail(profile.email)) ||
        (await authService.findUserByIdentifierIncludingDeleted(
          profile.email,
          "email",
        ));
      assertAccountActive(existingUser);

      if (existingUser) {
        await authService.linkOauthAccount({
          userId: existingUser.id,
          provider,
          providerUserId: profile.providerUserId,
        });
        user = existingUser;
        shouldSyncProviderAvatar = true;
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
          phoneVerified: false,
          oauth: { provider, providerUserId: profile.providerUserId },
          avatarSourceUrl: profile.pictureUrl,
          avatarSource: provider,
        });
        user = await authService.requireUser(userId);
      }
    }

    if (shouldSyncProviderAvatar && user) {
      await authService.syncProviderAvatar(
        user.id,
        provider,
        profile.pictureUrl,
      );
      user = await authService.requireUser(user.id);
    }

    const session = await sessionService.establishSession(user, request);
    return { user: { ...user, roles: session.roles }, session };
  }

  async function register(
    request: OauthRegisterRequest,
    providerProfile: OauthProfile,
    requestMeta: {
      ip: string;
      userAgent: string | null;
      existingSessionToken?: string | null;
      location?: SessionLocation | null;
    },
  ) {
    // As in `login`: the stored form of the address, for the lookups and
    // for the account created below.
    const profile = normalizeOauthProfile(providerProfile);
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
      (await authService.findUserByIdentifierIncludingDeleted(
        profile.email,
        "email",
      ));
    assertAccountActive(user);

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
        phoneVerified: false,
        oauth: { provider, providerUserId: profile.providerUserId },
        avatarSourceUrl: profile.pictureUrl,
        avatarSource: provider,
      });
      user = await authService.requireUser(userId);
    }

    if (statusCode === 200 && user) {
      await authService.syncProviderAvatar(
        user.id,
        provider,
        profile.pictureUrl,
      );
      user = await authService.requireUser(user.id);
    }

    const session = await sessionService.establishSession(user, requestMeta);
    return { statusCode, user: { ...user, roles: session.roles }, session };
  }

  return {
    getPublicConfig,
    createAuthorizationUrl,
    resolveCallbackProfile,
    createGoogleOneTapNonce,
    loginWithGoogleCredential,
    login,
    register,
    oauthStateCookieName: OAUTH_STATE_COOKIE,
  };
}

export type OauthService = ReturnType<typeof createOauthService>;
