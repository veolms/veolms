import crypto from "node:crypto";

import type { SignInFailureReportRequest } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { resolveIdentifier } from "../shared/auth.utils.ts";

/**
 * The address a report names, as the first 16 hex digits of the SHA-256 of
 * its normalised form (the same form sign-in stores). Support finds a
 * student's reports by hashing the address they wrote from; the logs never
 * hold the address itself.
 */
function hashIdentifier(identifier: string): string | undefined {
  try {
    const resolved = resolveIdentifier(
      identifier.includes("@")
        ? { email: identifier }
        : { phoneNo: identifier },
    );
    return crypto
      .createHash("sha256")
      .update(resolved.identifier)
      .digest("hex")
      .slice(0, 16);
  } catch {
    return undefined;
  }
}

export function createSignInFailuresController() {
  async function report(
    request: FastifyRequest<{ Body: SignInFailureReportRequest }>,
  ): Promise<{ message: string }> {
    const userAgent = request.headers["user-agent"]?.slice(0, 300);
    for (const failure of request.body.reports) {
      const { identifier, ...details } = failure;
      request.log.warn(
        {
          signInFailure: {
            ...details,
            identifierHash: identifier ? hashIdentifier(identifier) : undefined,
            ip: request.ip,
            userAgent,
          },
        },
        "Sign-in request failed in the browser",
      );
    }
    return { message: "Report received." };
  }

  return { report };
}
