import type {
  GoogleOneTapLoginRequest,
  OauthCallbackRequest,
  OauthRegisterRequest,
  OauthUrlRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthContext } from "../shared/auth.context.ts";
import {
  clearOauthStateCookie,
  setOauthStateCookie,
  setSessionCookie,
} from "../shared/auth.cookies.ts";
import { presentLogin } from "../shared/auth.presenters.ts";
import { requestLocation } from "../shared/request-location.ts";

export function createOauthController(context: AuthContext) {
  const { oauthService } = context;

  async function getUrl(
    request: FastifyRequest<{ Body: OauthUrlRequest }>,
    reply: FastifyReply,
  ) {
    const result = oauthService.createAuthorizationUrl(
      request.body.provider,
      request.body.redirectUri,
      request.log,
    );
    setOauthStateCookie(reply, result.cookie);
    return { url: result.url };
  }

  async function login(
    request: FastifyRequest<{ Body: OauthCallbackRequest }>,
    reply: FastifyReply,
  ) {
    const callback = await oauthService.resolveCallbackProfile(
      request.body,
      request.cookies[oauthService.oauthStateCookieName],
      () => clearOauthStateCookie(reply),
      request.log,
    );

    const existingSessionToken = request.cookies["veolms-session"] ?? null;
    const result = await oauthService.login(request.body.provider, callback, {
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      location: requestLocation(request.headers),
      existingSessionToken,
    });

    setSessionCookie(reply, result.session.token);
    return presentLogin(result.user, result.session.mfa);
  }

  async function loginWithGoogleOneTap(
    request: FastifyRequest<{ Body: GoogleOneTapLoginRequest }>,
    reply: FastifyReply,
  ) {
    const existingSessionToken = request.cookies["veolms-session"] ?? null;
    const result = await oauthService.loginWithGoogleCredential(
      request.body.credential,
      {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        location: requestLocation(request.headers),
        existingSessionToken,
      },
    );

    setSessionCookie(reply, result.session.token);
    return presentLogin(result.user, result.session.mfa);
  }

  async function register(
    request: FastifyRequest<{ Body: OauthRegisterRequest }>,
    reply: FastifyReply,
  ) {
    const callback = await oauthService.resolveCallbackProfile(
      request.body,
      request.cookies[oauthService.oauthStateCookieName],
      () => clearOauthStateCookie(reply),
      request.log,
    );

    const existingSessionToken = request.cookies["veolms-session"] ?? null;
    const result = await oauthService.register(request.body, callback, {
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      location: requestLocation(request.headers),
      existingSessionToken,
    });

    setSessionCookie(reply, result.session.token);
    reply.code(result.statusCode);
    return presentLogin(result.user, result.session.mfa);
  }

  async function getGoogleOneTapNonce(
    _request: FastifyRequest,
    _reply: FastifyReply,
  ) {
    const result = await oauthService.createGoogleOneTapNonce();
    return { nonce: result.nonce, expiresAt: result.expiresAt.toISOString() };
  }

  return {
    getUrl,
    login,
    loginWithGoogleOneTap,
    register,
    getGoogleOneTapNonce,
  };
}

export type OauthController = ReturnType<typeof createOauthController>;
