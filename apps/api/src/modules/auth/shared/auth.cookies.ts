import type { FastifyReply } from "fastify";

import { config } from "../../../config.ts";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  SETUP_COOKIE,
  SETUP_SESSION_TTL_SECONDS,
} from "./auth.constants.ts";

/**
 * Shared cookie attributes. `secure` tracks the environment because a secure
 * cookie is dropped by browsers over plain HTTP, which would break local
 * development entirely.
 */
const baseOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    ...baseOptions,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function setOauthStateCookie(
  reply: FastifyReply,
  payload: { state: string; provider: string; code_verifier?: string },
): void {
  reply.setCookie(OAUTH_STATE_COOKIE, JSON.stringify(payload), {
    ...baseOptions,
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
}

export function clearOauthStateCookie(reply: FastifyReply): void {
  reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
}

/**
 * Issues the setup session as a signed cookie carrying its own expiry.
 *
 * This replaced a per-process in-memory Map of valid session ids, which lost
 * every session on restart, could not work behind more than one API instance,
 * and only pruned expired entries when they happened to be looked up. Signing
 * (via the secret `@fastify/cookie` is registered with) makes the value
 * unforgeable without server state.
 */
export function setSetupCookie(reply: FastifyReply, expiresAt: number): void {
  reply.setCookie(SETUP_COOKIE, JSON.stringify({ exp: expiresAt }), {
    ...baseOptions,
    signed: true,
    maxAge: SETUP_SESSION_TTL_SECONDS,
  });
}

export function clearSetupCookie(reply: FastifyReply): void {
  reply.clearCookie(SETUP_COOKIE, { path: "/" });
}
