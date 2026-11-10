import type {
  ActiveSessionsVerificationRequest,
  SendActiveSessionsVerificationRequest,
  SessionParams,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { config } from "../../../config.ts";
import {
  SESSION_IP_ADDRESS_MAX_LENGTH,
  SESSION_USER_AGENT_MAX_LENGTH,
} from "../shared/auth.constants.ts";
import type { AuthContext } from "../shared/auth.context.ts";
import { formatSessionLocation } from "../shared/request-location.ts";
import type { listUserSessions } from "./session.repository.ts";

type UserSessionRow = Awaited<ReturnType<typeof listUserSessions>>[number];

// Sessions stored before these details were bounded on write can still hold
// longer values; one such row must not fail the whole list.
function presentSession(session: UserSessionRow, currentId: string) {
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

  async function sendActiveSessionsVerificationCode(
    request: FastifyRequest<{
      Body?: SendActiveSessionsVerificationRequest;
    }>,
  ) {
    const { channel, maskedDestination } =
      await sessionService.sendActiveSessionsVerificationCode(
        request.user!,
        request.ip,
        request.body?.channel,
      );
    return {
      message: "Active-session verification code sent.",
      codeExpiresInSeconds: config.OTP_TTL_MINUTES * 60,
      channel,
      maskedDestination,
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
      request.body.channel,
    );
    return {
      message: "Identity verified for active sessions.",
      verifiedUntil,
    };
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
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
