import { z } from "zod";

import {
  CHAT_BODY_MAX_CHARS,
  chatSenderRoleSchema,
  chatUploadKindSchema,
} from "./chat.ts";

/**
 * Chat assistants: a chat member ("Claude") that admins and instructors talk
 * to in a private chat, backed by an outside agent service. People use the
 * normal chat routes to write; these routes find or open the chat, show the
 * status cards and stop a running request. The agent service uses the
 * `/assistant/agent/*` routes with `Authorization: Assistant <token>`.
 */

/** The scheme of the agent's Authorization header. */
export const ASSISTANT_AUTH_SCHEME = "Assistant";

export const ASSISTANT_ERROR_CODES = {
  disabled: "ASSISTANT_DISABLED",
  notAllowed: "ASSISTANT_NOT_ALLOWED",
  tokenInvalid: "ASSISTANT_TOKEN_INVALID",
  cardNotFound: "ASSISTANT_CARD_NOT_FOUND",
  cardFinished: "ASSISTANT_CARD_FINISHED",
  roomNotFound: "ASSISTANT_ROOM_NOT_FOUND",
  fileTooLarge: "ASSISTANT_FILE_TOO_LARGE",
  fileType: "ASSISTANT_FILE_TYPE",
} as const;

export const ASSISTANT_LIMITS = {
  titleChars: 120,
  steps: 20,
  stepLabelChars: 80,
  links: 10,
  linkLabelChars: 40,
  inboxMaxWaitSeconds: 25,
  inboxMaxItems: 50,
  uploadMaxBytes: 50 * 1024 * 1024,
  cardsPerPage: 50,
} as const;

export const assistantCardKindSchema = z.enum([
  "fix",
  "build",
  "research",
  "ask",
  "review",
]);
export type AssistantCardKind = z.infer<typeof assistantCardKindSchema>;

export const assistantCardStateSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "done",
  "failed",
  "stopped",
]);
export type AssistantCardState = z.infer<typeof assistantCardStateSchema>;

/** Finished cards cannot change any more. */
export const ASSISTANT_FINISHED_STATES: readonly AssistantCardState[] = [
  "done",
  "failed",
  "stopped",
];

export const assistantCardStepSchema = z.strictObject({
  label: z.string().trim().min(1).max(ASSISTANT_LIMITS.stepLabelChars),
  state: z.enum(["pending", "active", "done", "failed", "skipped"]),
});
export type AssistantCardStep = z.infer<typeof assistantCardStepSchema>;

export const assistantCardLinkSchema = z.strictObject({
  label: z.string().trim().min(1).max(ASSISTANT_LIMITS.linkLabelChars),
  url: z
    .url()
    .max(2000)
    .refine((value) => value.startsWith("https://"), "Links must be https"),
});
export type AssistantCardLink = z.infer<typeof assistantCardLinkSchema>;

export const assistantCardSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  /** The card's own chat message (null until it is posted). */
  messageSeq: z.number().int().nullable(),
  /** The person's message that started this request. */
  requestSeq: z.number().int(),
  kind: assistantCardKindSchema,
  title: z.string(),
  state: assistantCardStateSchema,
  steps: z.array(assistantCardStepSchema),
  links: z.array(assistantCardLinkSchema),
  stopRequested: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type AssistantCard = z.infer<typeof assistantCardSchema>;

// ------------------------------------------------------------ people routes

export const assistantInfoResponseSchema = z.object({
  /** Whether the signed-in person may talk to the assistant. */
  available: z.boolean(),
  assistant: z
    .object({
      userId: z.uuid(),
      name: z.string(),
    })
    .nullable(),
  /** The person's chat with the assistant, once opened. */
  roomId: z.uuid().nullable(),
  /** The agent checked in within the last 2 minutes. */
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
  /** What the agent reported as wrong ("Claude is not signed in"), if anything. */
  problem: z.string().nullable(),
});
export type AssistantInfoResponse = z.infer<typeof assistantInfoResponseSchema>;

export const assistantConversationResponseSchema = z.object({
  roomId: z.uuid(),
});
export type AssistantConversationResponse = z.infer<
  typeof assistantConversationResponseSchema
>;

export const assistantCardListQuerySchema = z.strictObject({
  roomId: z.uuid(),
});
export const assistantCardListResponseSchema = z.object({
  cards: z.array(assistantCardSchema),
});
export type AssistantCardListResponse = z.infer<
  typeof assistantCardListResponseSchema
>;

export const assistantCardParamsSchema = z.strictObject({
  cardId: z.uuid(),
});
export const assistantCardResponseSchema = z.object({
  card: assistantCardSchema,
});
export type AssistantCardResponse = z.infer<typeof assistantCardResponseSchema>;

// ------------------------------------------------------------- agent routes

export const assistantInboxQuerySchema = z.strictObject({
  waitSeconds: z.coerce
    .number()
    .int()
    .min(0)
    .max(ASSISTANT_LIMITS.inboxMaxWaitSeconds)
    .default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ASSISTANT_LIMITS.inboxMaxItems)
    .default(20),
});

export const assistantInboxAttachmentSchema = z.object({
  id: z.uuid(),
  kind: chatUploadKindSchema,
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
});

export const assistantInboxMessageSchema = z.object({
  kind: z.literal("message"),
  roomId: z.uuid(),
  seq: z.number().int(),
  sender: z.object({
    id: z.uuid(),
    name: z.string(),
    role: chatSenderRoleSchema,
    platformRoles: z.array(z.string()),
  }),
  body: z.string(),
  replyToSeq: z.number().int().nullable(),
  attachments: z.array(assistantInboxAttachmentSchema),
  sentAt: z.string(),
});
export type AssistantInboxMessage = z.infer<typeof assistantInboxMessageSchema>;

export const assistantInboxStopSchema = z.object({
  kind: z.literal("stop"),
  roomId: z.uuid(),
  cardId: z.uuid(),
  requestedAt: z.string(),
});
export type AssistantInboxStop = z.infer<typeof assistantInboxStopSchema>;

export const assistantInboxResponseSchema = z.object({
  items: z.array(
    z.discriminatedUnion("kind", [
      assistantInboxMessageSchema,
      assistantInboxStopSchema,
    ]),
  ),
});
export type AssistantInboxResponse = z.infer<
  typeof assistantInboxResponseSchema
>;

export const assistantInboxAckRequestSchema = z.strictObject({
  messages: z
    .array(z.strictObject({ roomId: z.uuid(), seq: z.number().int().min(1) }))
    .max(200)
    .default([]),
  stops: z.array(z.uuid()).max(200).default([]),
});
export type AssistantInboxAckRequest = z.infer<
  typeof assistantInboxAckRequestSchema
>;

export const assistantHeartbeatRequestSchema = z.strictObject({
  version: z.string().trim().max(64).optional(),
  running: z.number().int().min(0).max(1000).default(0),
  queued: z.number().int().min(0).max(100_000).default(0),
  /** A problem people should know about ("Claude is not signed in"). */
  problem: z.string().trim().max(200).nullable().optional(),
});
export type AssistantHeartbeatRequest = z.infer<
  typeof assistantHeartbeatRequestSchema
>;

export const assistantCreateCardRequestSchema = z.strictObject({
  /** The agent's job id: repeating the call returns the same card. */
  id: z.uuid(),
  roomId: z.uuid(),
  requestSeq: z.number().int().min(1),
  kind: assistantCardKindSchema,
  title: z.string().trim().min(1).max(ASSISTANT_LIMITS.titleChars),
  steps: z
    .array(assistantCardStepSchema)
    .max(ASSISTANT_LIMITS.steps)
    .optional(),
});
export type AssistantCreateCardRequest = z.infer<
  typeof assistantCreateCardRequestSchema
>;

export const assistantUpdateCardRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(ASSISTANT_LIMITS.titleChars).optional(),
  state: assistantCardStateSchema.optional(),
  steps: z
    .array(assistantCardStepSchema)
    .max(ASSISTANT_LIMITS.steps)
    .optional(),
  links: z
    .array(assistantCardLinkSchema)
    .max(ASSISTANT_LIMITS.links)
    .optional(),
});
export type AssistantUpdateCardRequest = z.infer<
  typeof assistantUpdateCardRequestSchema
>;

export const assistantRoomParamsSchema = z.strictObject({
  roomId: z.uuid(),
});
export const assistantUploadParamsSchema = z.strictObject({
  roomId: z.uuid(),
  uploadId: z.uuid(),
});

export const assistantSendRequestSchema = z.strictObject({
  clientId: z.uuid(),
  body: z.string().trim().min(1).max(CHAT_BODY_MAX_CHARS),
  replyToSeq: z.number().int().min(1).optional(),
  attachmentIds: z.array(z.uuid()).max(10).optional(),
});
export type AssistantSendRequest = z.infer<typeof assistantSendRequestSchema>;

export const assistantSendResponseSchema = z.object({
  seq: z.number().int(),
  duplicate: z.boolean(),
});
export type AssistantSendResponse = z.infer<typeof assistantSendResponseSchema>;

export const assistantUploadQuerySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
});
export const assistantUploadResponseSchema = z.object({
  uploadId: z.uuid(),
});
export type AssistantUploadResponse = z.infer<
  typeof assistantUploadResponseSchema
>;

export const assistantOkResponseSchema = z.object({ ok: z.literal(true) });
