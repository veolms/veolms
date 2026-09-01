import type {
  PasskeyLoginVerifyRequest,
  PasskeyRegisterVerifyRequest,
  TotpEnableRequest,
  TotpVerifyRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { AuthContext } from "../shared/auth.context.ts";
import {
  presentPasskeyAuthenticationOptions,
  presentPasskeyRegistrationOptions,
} from "./mfa.presenters.ts";

export function createMfaController(context: AuthContext) {
  const { mfaService } = context;

  async function setupTotp(request: FastifyRequest) {
    return mfaService.setupTotp(request.user!);
  }

  async function enableTotp(
    request: FastifyRequest<{ Body: TotpEnableRequest }>,
  ) {
    return mfaService.enableTotp({
      userId: request.user!.id,
      sessionId: request.session!.id,
      mfaVerified: request.session!.mfa_verified,
      code: request.body.code,
      secret: request.body.secret,
    });
  }

  async function verifyTotp(
    request: FastifyRequest<{ Body: TotpVerifyRequest }>,
  ) {
    return mfaService.verifyTotpCode({
      userId: request.user!.id,
      sessionId: request.session!.id,
      code: request.body.code,
    });
  }

  async function registerOptions(request: FastifyRequest) {
    return presentPasskeyRegistrationOptions(
      await mfaService.getPasskeyRegisterOptions(
        request.user!,
        request.session!.mfa_verified,
      ),
    );
  }

  async function registerVerify(
    request: FastifyRequest<{ Body: PasskeyRegisterVerifyRequest }>,
  ) {
    return mfaService.verifyPasskeyRegistration({
      userId: request.user!.id,
      sessionId: request.session!.id,
      response: request.body.response,
    });
  }

  async function loginOptions(request: FastifyRequest) {
    return presentPasskeyAuthenticationOptions(
      await mfaService.getPasskeyLoginOptions(request.user!.id),
    );
  }

  async function loginVerify(
    request: FastifyRequest<{ Body: PasskeyLoginVerifyRequest }>,
  ) {
    return mfaService.verifyPasskeyLogin({
      userId: request.user!.id,
      sessionId: request.session!.id,
      response: request.body.response,
    });
  }

  return {
    setupTotp,
    enableTotp,
    verifyTotp,
    registerOptions,
    registerVerify,
    loginOptions,
    loginVerify,
  };
}

export type MfaController = ReturnType<typeof createMfaController>;
