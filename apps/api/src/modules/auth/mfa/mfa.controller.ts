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

function extractRequestOrigin(request: FastifyRequest): string | undefined {
  if (typeof request.headers.origin === "string" && request.headers.origin) {
    return request.headers.origin;
  }
  if (typeof request.headers.referer === "string" && request.headers.referer) {
    try {
      return new URL(request.headers.referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

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

  async function disableTotp(request: FastifyRequest) {
    return mfaService.disableTotp(
      request.user!,
      request.session!.mfa_verified,
    );
  }

  async function deletePasskeys(request: FastifyRequest) {
    return mfaService.deletePasskeys(
      request.user!,
      request.session!.mfa_verified,
    );
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
        extractRequestOrigin(request),
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
      await mfaService.getPasskeyLoginOptions(
        request.user!.id,
        extractRequestOrigin(request),
      ),
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
    disableTotp,
    deletePasskeys,
    verifyTotp,
    registerOptions,
    registerVerify,
    loginOptions,
    loginVerify,
  };
}

export type MfaController = ReturnType<typeof createMfaController>;
