import type { FastifyRequest } from "fastify";

/**
 * Upload allowance for each signed-in account. The size of one file is
 * capped, but nothing capped how many a learner could send, and each one is
 * streamed into storage. Counted per account, after sign-in is checked, so
 * learners behind one shared address do not use up each other's allowance.
 */
export const DISCUSSION_UPLOAD_RATE_LIMIT = {
  max: 30,
  timeWindow: "1 minute",
  hook: "preHandler",
  keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
} as const;

export const DISCUSSION_CONSTANTS = {
  MAX_ATTACHMENT_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  MAX_MENTIONS_PER_POST: 20,
  SUPPORTED_CODE_EXTENSIONS: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".cpp",
    ".c",
    ".html",
    ".css",
    ".json",
    ".sql",
    ".sh",
  ],
} as const;
