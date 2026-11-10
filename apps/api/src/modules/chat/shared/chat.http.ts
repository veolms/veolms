import { normalizeIP } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";

import { config } from "../../../config.ts";
import { ChatErrors } from "./chat.errors.ts";

/** Per-user rate limit for a chat route (per process). */
export function perUser(max: number, timeWindow: string) {
  return {
    max,
    timeWindow,
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) =>
      request.user?.id ?? normalizeIP(request.ip),
  } as const;
}

/** CHAT_ENABLED off: every chat route answers 404, nothing is deleted. */
export async function requireChatEnabled(): Promise<void> {
  if (!config.CHAT_ENABLED) throw ChatErrors.disabled();
}

export const chatTags = ["Chat"];
