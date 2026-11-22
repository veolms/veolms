import { createHash, timingSafeEqual } from "node:crypto";

import { normalizeIP } from "@fastify/rate-limit";
import { ASSISTANT_AUTH_SCHEME } from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import { config } from "../../../config.ts";
import { AssistantErrors } from "./assistant.errors.ts";

export const assistantTags = ["Assistant"];

/** ASSISTANT_ENABLED off: every assistant route answers 404. */
export async function requireAssistantEnabled(): Promise<void> {
  if (!config.ASSISTANT_ENABLED) throw AssistantErrors.disabled();
}

/** The token from `Authorization: Assistant <token>`, or "". */
export function assistantTokenOf(request: FastifyRequest): string {
  const header = request.headers.authorization ?? "";
  const [scheme, token] = header.trim().split(/\s+/u);
  return scheme === ASSISTANT_AUTH_SCHEME && token ? token : "";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Whether `token` hashes to `expectedHash`, compared in constant time.
 * No hash configured means no token is valid.
 */
export function tokenMatches(
  token: string,
  expectedHash: string | undefined,
): boolean {
  if (!expectedHash || !token) return false;
  const actual = Buffer.from(sha256Hex(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The agent service's preHandler: a valid token or 401. */
export async function requireAgentToken(
  request: FastifyRequest,
): Promise<void> {
  if (
    !tokenMatches(
      assistantTokenOf(request),
      config.ASSISTANT_AGENT_TOKEN_SHA256,
    )
  ) {
    throw AssistantErrors.tokenInvalid();
  }
}

/** Rate limit for the agent (per caller IP; there is one agent per environment). */
export function perAgent(max: number, timeWindow: string) {
  return {
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      `agent:${normalizeIP(request.ip)}`,
  } as const;
}

/** Rate limit for people (per user). */
export function perPerson(max: number, timeWindow: string) {
  return {
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      request.user?.id ?? normalizeIP(request.ip),
  } as const;
}
