import type { OtpSendRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { AuthContext } from "../shared/auth.context.ts";
import { resolveIdentifier } from "../shared/auth.utils.ts";

export function createOtpController(context: AuthContext) {
  const { otpService } = context;

  async function send(
    request: FastifyRequest<{ Body: OtpSendRequest }>,
  ): Promise<{ message: string }> {
    const { identifier, identifierType } = resolveIdentifier(request.body);
    await otpService.sendOtp(identifier, identifierType);
    return { message: "Verification OTP sent successfully." };
  }

  return { send };
}

export type OtpController = ReturnType<typeof createOtpController>;
