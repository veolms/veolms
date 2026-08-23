import type { SessionParams } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { AuthContext } from "../shared/auth.context.ts";

export function createSessionController(context: AuthContext) {
  const { sessionService } = context;

  async function list(request: FastifyRequest) {
    const currentSessionId = request.session!.id;
    const sessions = await sessionService.listSessions(request.user!.id);

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      isCurrent: session.id === currentSessionId,
      createdAt: session.created_at.toISOString(),
      lastUsedAt: session.last_used_at.toISOString(),
    }));
  }

  async function revoke(request: FastifyRequest<{ Params: SessionParams }>) {
    await sessionService.revokeSession(request.user!.id, request.params.id);
    return { message: "Session revoked" };
  }

  async function revokeAll(request: FastifyRequest) {
    await sessionService.revokeOtherSessions(
      request.user!.id,
      request.session!.id,
    );
    return { message: "All other sessions revoked" };
  }

  return { list, revoke, revokeAll };
}

export type SessionController = ReturnType<typeof createSessionController>;
