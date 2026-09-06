import type {
  EmailVerificationVerifyRequest,
  OtpSendRequest,
  PhoneVerificationSendRequest,
  PhoneVerificationVerifyRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { AuthContext } from "../shared/auth.context.ts";
import { resolveIdentifier } from "../shared/auth.utils.ts";

export function createOtpController(context: AuthContext) {
  const { authService, otpService } = context;

  async function send(
    request: FastifyRequest<{ Body: OtpSendRequest }>,
  ): Promise<{ message: string }> {
    const { identifier, identifierType } = resolveIdentifier(request.body);
    await otpService.sendOtp(identifier, identifierType);
    return { message: "Verification OTP sent successfully." };
  }

  async function sendPhoneVerification(
    request: FastifyRequest<{ Body: PhoneVerificationSendRequest }>,
  ): Promise<{ message: string }> {
    await authService.sendPhoneVerificationOtp(
      request.user!.id,
      request.body.phoneNo,
    );
    return { message: "Mobile verification OTP sent successfully." };
  }

  async function sendEmailVerification(
    request: FastifyRequest,
  ): Promise<{ message: string }> {
    await authService.sendEmailVerificationOtp(request.user!.id);
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
