import type {
  AcademyRequest,
  CreatorRegisterRequest,
  SetupTokenRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  SETUP_COOKIE,
  SETUP_SESSION_TTL_MS,
} from "../shared/auth.constants.ts";
import type { AuthContext } from "../shared/auth.context.ts";
import {
  clearSetupCookie,
  setSessionCookie,
  setSetupCookie,
} from "../shared/auth.cookies.ts";
import { presentLogin } from "../shared/auth.presenters.ts";

export function createSetupController(context: AuthContext) {
  const { setupService } = context;

  function getSignedSetupCookie(request: FastifyRequest) {
    const cookie = request.cookies[SETUP_COOKIE];
    return cookie ? request.unsignCookie(cookie) : undefined;
  }

  async function verifyToken(
    request: FastifyRequest<{ Body: SetupTokenRequest }>,
    reply: FastifyReply,
  ) {
    await setupService.verifySetupToken(request.body.token);
    setSetupCookie(reply, Date.now() + SETUP_SESSION_TTL_MS);
    return { message: "Setup token verified successfully." };
  }

  async function registerCreator(
    request: FastifyRequest<{ Body: CreatorRegisterRequest }>,
    reply: FastifyReply,
  ) {
    await setupService.assertSetupOpen();
    await setupService.assertValidSetupSession(getSignedSetupCookie(request));
    const result = await setupService.registerCreator(request.body, {
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    setSessionCookie(reply, result.session.token);
    reply.code(201);
    return presentLogin(result.user, result.session.mfa);
  }

  async function academy(request: FastifyRequest<{ Body: AcademyRequest }>) {
    await setupService.assertSetupOpen();
    await setupService.assertValidSetupSession(getSignedSetupCookie(request));
    return setupService.configureAcademy(request.body);
  }

  async function finish(request: FastifyRequest, reply: FastifyReply) {
    await setupService.assertSetupOpen();
    await setupService.assertValidSetupSession(getSignedSetupCookie(request));
    await setupService.finalizeSetup();
    clearSetupCookie(reply);
    return { message: "Academy setup finalized successfully." };
  }

  return { verifyToken, registerCreator, academy, finish };
}

export type SetupController = ReturnType<typeof createSetupController>;
