import type { AuthContext } from "../shared/auth.context.ts";
import {
  clearSessionCookie,
  setSessionCookie,
} from "../shared/auth.cookies.ts";
import { presentLogin } from "../shared/auth.presenters.ts";
import { resolveIdentifier } from "../shared/auth.utils.ts";
import type { LoginRequest, RegisterRequest } from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

export function createAuthController(context: AuthContext) {
  const { authService, oauthService, sessionService } = context;

  async function login(
    request: FastifyRequest<{ Body: LoginRequest }>,
    reply: FastifyReply,
  ) {
    const { identifier, identifierType } = resolveIdentifier(request.body);
    const result = await authService.login({
      identifier,
      identifierType,
      code: request.body.code,
      request: {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
    });

    setSessionCookie(reply, result.session.token);
    return presentLogin(result.user, result.session.mfa);
  }

  async function register(
    request: FastifyRequest<{ Body: RegisterRequest }>,
    reply: FastifyReply,
  ) {
    const {
      email,
      phoneNo,
      code,
      emailCode,
      phoneCode,
      username,
      displayName,
    } = request.body;
    const { identifier, identifierType } = resolveIdentifier(request.body);
    const result = await authService.register({
      identifier,
      identifierType,
      email,
      phoneNo,
      code,
      emailCode,
      phoneCode,
      username,
      displayName,
      request: {
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
    });

    setSessionCookie(reply, result.session.token);
    reply.code(201);
    return presentLogin(result.user, result.session.mfa);
  }

  async function getConfig() {
    return oauthService.getPublicConfig();
  }

  async function logout(request: FastifyRequest, reply: FastifyReply) {
    if (request.session) {
      await sessionService.logout(request.session.id);
    }

    clearSessionCookie(reply);
    return { message: "Logged out successfully" };
  }

  async function me(request: FastifyRequest) {
    const user = request.user;
    const session = request.session;

    if (!user || !session) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      phoneNo: user.phoneNo,
      roles: user.roles,
      permissions: user.permissions,
      menus: user.menus,
      mfaVerified: session.mfa_verified,
      totpEnabled: user.totpEnabled,
      passkeyEnabled: user.passkeyEnabled,
      mfaMandatory: user.mfaMandatory,
    };
  }

  return { login, register, getConfig, logout, me };
}

export type AuthController = ReturnType<typeof createAuthController>;
