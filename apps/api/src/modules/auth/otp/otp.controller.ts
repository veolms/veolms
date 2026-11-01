import type {
  EmailVerificationVerifyRequest,
  OtpSendRequest,
  OtpSendResponse,
  PhoneVerificationSendRequest,
  PhoneVerificationVerifyRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { config } from "../../../config.ts";
import type { AuthContext } from "../shared/auth.context.ts";
import { resolveIdentifier } from "../shared/auth.utils.ts";

export function createOtpController(context: AuthContext) {
  const { authService, otpService } = context;

  async function send(
    request: FastifyRequest<{ Body: OtpSendRequest }>,
  ): Promise<OtpSendResponse> {
    const { identifier, identifierType } = resolveIdentifier(request.body);
    await otpService.sendOtp(identifier, identifierType, { ip: request.ip });
    // The same for every address (a deactivated account's included), so the
    // answer says nothing about the account behind it.
    return {
      message: "Verification OTP sent successfully.",
      codeExpiresInSeconds: config.OTP_TTL_MINUTES * 60,
    };
  }

  async function sendPhoneVerification(
    request: FastifyRequest<{ Body: PhoneVerificationSendRequest }>,
  ): Promise<OtpSendResponse> {
    await authService.sendPhoneVerificationOtp(
      request.user!.id,
      request.body.phoneNo,
      request.ip,
    );
    return {
      message: "Mobile verification OTP sent successfully.",
      codeExpiresInSeconds: config.OTP_TTL_MINUTES * 60,
    };
  }

  async function sendEmailVerification(
    request: FastifyRequest,
  ): Promise<{ message: string }> {
    await authService.sendEmailVerificationOtp(request.user!.id, request.ip);
    return { message: "Email verification OTP sent successfully." };
  }

  async function verifyPhoneNumber(
    request: FastifyRequest<{ Body: PhoneVerificationVerifyRequest }>,
  ): Promise<{ message: string }> {
    await authService.verifyPhoneNumber(
      request.user!.id,
      request.body.phoneNo,
      request.body.code,
    );
    return { message: "Mobile number verified successfully." };
  }

  async function verifyEmail(
    request: FastifyRequest<{ Body: EmailVerificationVerifyRequest }>,
  ): Promise<{ message: string }> {
    await authService.verifyEmail(request.user!.id, request.body.code);
    return { message: "Email address verified successfully." };
  }

  return {
    send,
    sendPhoneVerification,
    verifyPhoneNumber,
    sendEmailVerification,
    verifyEmail,
  };
}

export type OtpController = ReturnType<typeof createOtpController>;
