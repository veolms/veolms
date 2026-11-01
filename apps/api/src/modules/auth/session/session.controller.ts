import type {
  ActiveSessionsVerificationRequest,
  ResolveDeviceLimitRequest,
  SessionParams,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../../config.ts";
import {
  DEVICE_SIGN_IN_COOKIE,
  SESSION_IP_ADDRESS_MAX_LENGTH,
  SESSION_USER_AGENT_MAX_LENGTH,
} from "../shared/auth.constants.ts";
import type { AuthContext } from "../shared/auth.context.ts";
import {
  clearDeviceSignInCookie,
  setSessionCookie,
} from "../shared/auth.cookies.ts";
import { presentLogin } from "../shared/auth.presenters.ts";
import { formatSessionLocation } from "../shared/request-location.ts";
import type { listUserSessions } from "./session.repository.ts";

type UserSessionRow = Awaited<ReturnType<typeof listUserSessions>>[number];

// Sessions stored before these details were bounded on write can still hold
// longer values; one such row must not fail the whole list.
function presentSession(session: UserSessionRow, currentId?: string) {
  return {
    id: session.id,
    ipAddress:
      session.ip_address?.slice(0, SESSION_IP_ADDRESS_MAX_LENGTH) ?? null,
    userAgent:
      session.user_agent?.slice(0, SESSION_USER_AGENT_MAX_LENGTH) ?? null,
    location: formatSessionLocation(session),
    isCurrent: session.id === currentId,
    lastUsedAt: session.last_used_at.toISOString(),
  };
}

export function createSessionController(context: AuthContext) {
  const { sessionService } = context;

  async function list(request: FastifyRequest) {
    const currentSessionId = request.session!.id;
    const sessions = await sessionService.listSessions(
      request.user!.id,
      currentSessionId,
    );
    return sessions.map((session) => presentSession(session, currentSessionId));
  }

  async function sendActiveSessionsVerificationCode(request: FastifyRequest) {
    await sessionService.sendActiveSessionsVerificationCode(
      request.user!,
      request.ip,
    );
    return {
      message: "Active-session verification code sent.",
      codeExpiresInSeconds: config.OTP_TTL_MINUTES * 60,
    };
  }

  async function verifyActiveSessionsCode(
    request: FastifyRequest<{
      Body: ActiveSessionsVerificationRequest;
    }>,
  ) {
    const { verifiedUntil } = await sessionService.verifyActiveSessionsCode(
      request.user!,
      request.session!.id,
      request.body.code,
    );
    return {
      message: "Identity verified for active sessions.",
      verifiedUntil,
    };
  }

  async function deviceLimit(request: FastifyRequest) {
    const { limit, sessions } = await sessionService.getDeviceLimitChoice(
      request.cookies[DEVICE_SIGN_IN_COOKIE],
    );
    return {
      limit,
      sessions: sessions.map((session) => presentSession(session)),
    };
  }

  async function resolveDeviceLimit(
    request: FastifyRequest<{ Body: ResolveDeviceLimitRequest }>,
    reply: FastifyReply,
  ) {
    const { user, session } = await sessionService.resolveDeviceLimit(
      request.cookies[DEVICE_SIGN_IN_COOKIE],
      request.body.sessionId,
    );
    clearDeviceSignInCookie(reply);
    setSessionCookie(reply, session.token);
    return presentLogin(user, session.mfa);
  }

  async function revoke(request: FastifyRequest<{ Params: SessionParams }>) {
    await sessionService.revokeSession(
      request.user!.id,
      request.params.id,
      request.session!.id,
    );
    return { message: "Session revoked" };
  }

  async function revokeAll(request: FastifyRequest) {
    await sessionService.revokeOtherSessions(
      request.user!.id,
      request.session!.id,
    );
    return { message: "All other sessions revoked" };
  }

  return {
    list,
    sendActiveSessionsVerificationCode,
    verifyActiveSessionsCode,
    revoke,
    revokeAll,
    deviceLimit,
    resolveDeviceLimit,
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
