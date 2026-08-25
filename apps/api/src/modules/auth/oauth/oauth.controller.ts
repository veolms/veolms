import type {
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

export function createOauthController(context: AuthContext) {
  const { oauthService } = context;

  async function getUrl(
    request: FastifyRequest<{ Body: OauthUrlRequest }>,
    reply: FastifyReply,
  ) {
    const result = oauthService.createAuthorizationUrl(
      request.body.provider,
      request.body.redirectUri,
    );
    setOauthStateCookie(reply, result.cookie);
    return { url: result.url, state: result.state };
  }

  async function login(
    request: FastifyRequest<{ Body: OauthCallbackRequest }>,
    reply: FastifyReply,
  ) {
    const callback = await oauthService.resolveCallbackProfile(
      request.body,
      request.cookies[oauthService.oauthStateCookieName],
      () => clearOauthStateCookie(reply),
    );

    const result = await oauthService.login(request.body.provider, callback, {
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

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
    );

    const result = await oauthService.register(request.body, callback, {
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    setSessionCookie(reply, result.session.token);
    reply.code(result.statusCode);
    return presentLogin(result.user, result.session.mfa);
  }

  return { getUrl, login, register };
}

export type OauthController = ReturnType<typeof createOauthController>;
