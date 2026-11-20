import { AFFILIATE_CLICK_COOKIE } from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "../../config.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The visitor's affiliate click, set by the API in its own response so
 * Safari does not cut it to seven days as it does cookies set by script.
 * Host-only (no Domain), so one academy's cookie is never sent to another.
 * It holds only the click id, signed with the server secret (the one
 * `@fastify/cookie` is registered with): an edited cookie fails the check
 * and is ignored.
 */
export function setAffiliateClickCookie(
  reply: FastifyReply,
  clickId: string,
  maxAgeSeconds: number,
): void {
  reply.setCookie(AFFILIATE_CLICK_COOKIE, clickId, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    signed: true,
    maxAge: maxAgeSeconds,
  });
}

/** The click id in the request's cookie, when it is there and genuine. */
export function readAffiliateClickId(request: FastifyRequest): string | null {
  const raw = request.cookies?.[AFFILIATE_CLICK_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return UUID_PATTERN.test(unsigned.value) ? unsigned.value : null;
}
