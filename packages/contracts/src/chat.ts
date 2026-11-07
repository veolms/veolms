import { z } from "zod";

/**
 * Chat: course groups, team groups and private chats, with WhatsApp's
 * patterns (CHAT_ROOM_PLAN.md). Live updates arrive on GET /chat/stream
 * (Server-Sent Events); everything is sent with ordinary requests.
 *
 * Message numbers (`seq`) are gapless per chat. `eventSeq` counts every
 * change in a chat (new, edited, deleted, pinned, reacted): a client keeps
 * the highest it has seen and asks GET .../changes?since= after a gap or a
 * reconnect.
 */

export const CHAT_BODY_MAX_CHARS = 2_000;
/** The stored limit; also keeps a message inside one live event. */
export const CHAT_BODY_MAX_BYTES = 6_000;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_PAGE_MAX = 100;
/** Beyond this many changes a client reloads the latest page instead. */
export const CHAT_CHANGES_MAX = 200;
export const CHAT_EDIT_WINDOW_MINUTES = 15;
export const CHAT_DELETE_FOR_EVERYONE_HOURS = 48;
export const CHAT_RESTORE_DAYS = 7;
export const CHAT_MAX_PINNED_MESSAGES = 3;
export const CHAT_MAX_PINNED_CHATS = 3;
export const CHAT_RECEIPTS_MAX = 50;
export const CHAT_TEAM_ROOM_MAX_MEMBERS = 256;
/** Helpers may mute for at most this long. */
export const CHAT_HELPER_MAX_MUTE_MINUTES = 24 * 60;

export const chatRoomKindSchema = z.enum(["course", "team", "direct"]);
export type ChatRoomKind = z.infer<typeof chatRoomKindSchema>;
export const chatDirectStatusSchema = z.enum([
  "requested",
  "accepted",
  "declined",
]);
export const chatPostingPolicySchema = z.enum(["everyone", "staff_only"]);
export const chatRoomStatusSchema = z.enum(["active", "locked", "archived"]);
export const chatRoomRoleSchema = z.enum(["owner", "moderator", "member"]);
export const chatNotifyLevelSchema = z.enum(["all", "mentions", "none"]);
export const chatSenderRoleSchema = z.enum([
  "admin",
  "instructor",
  "staff",
  "helper",
  "learner",
]);
export type ChatSenderRole = z.infer<typeof chatSenderRoleSchema>;
export const chatReasonSchema = z.enum([
  "spam",
  "harassment",
  "scam",
  "inappropriate",
  "other",
]);
export type ChatReason = z.infer<typeof chatReasonSchema>;
export const chatRestrictionTypeSchema = z.enum(["mute", "ban", "no_direct"]);
export type ChatRestrictionType = z.infer<typeof chatRestrictionTypeSchema>;
export const chatReportStatusSchema = z.enum(["open", "actioned", "dismissed"]);
export const chatDirectPolicySchema = z.enum([
  "off",
  "staff_only",
  "course_peers",
]);
export type ChatDirectPolicy = z.infer<typeof chatDirectPolicySchema>;

const seqSchema = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const sinceSchema = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const isoDate = z.string();

export const chatRoomParamsSchema = z.strictObject({ roomId: z.uuid() });
export const chatMessageParamsSchema = z.strictObject({
  roomId: z.uuid(),
  seq: seqSchema,
});
export const chatCourseParamsSchema = z.strictObject({ courseId: z.uuid() });
export const chatUserParamsSchema = z.strictObject({ userId: z.uuid() });
export const chatRoomUserParamsSchema = z.strictObject({
  roomId: z.uuid(),
  userId: z.uuid(),
});
export const chatIdParamsSchema = z.strictObject({ id: z.uuid() });

export const chatPersonSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type ChatPerson = z.infer<typeof chatPersonSchema>;

export const CHAT_MAX_ATTACHMENTS_PER_MESSAGE = 10;
/** Per file, by kind (photos are made smaller in the browser first). */
export const CHAT_UPLOAD_MAX_BYTES = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  file: 25 * 1024 * 1024,
} as const;
/** What one learner may upload per day across all chats. */
export const CHAT_UPLOAD_DAILY_BYTES = 300 * 1024 * 1024;
export const CHAT_VOICE_MAX_SECONDS = 15 * 60;
/** Types a browser may upload, by kind. No SVG/HTML: they can run script. */
export const CHAT_UPLOAD_MIME_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac"],
  file: [
    "application/pdf",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
  ],
} as const;
export const chatUploadKindSchema = z.enum(["image", "video", "audio", "file"]);
export type ChatUploadKind = z.infer<typeof chatUploadKindSchema>;

export const chatAttachmentSchema = z.object({
  id: z.uuid(),
  kind: chatUploadKindSchema,
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  waveform: z.array(z.number().int()).nullable(),
  /** Read with the session cookie (redirects to a signed URL). */
  url: z.string(),
});
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;

export const chatCreateUploadRequestSchema = z.strictObject({
  kind: chatUploadKindSchema,
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  size: z.number().int().min(1),
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 1000)
    .optional(),
  waveform: z.array(z.number().int().min(0).max(100)).max(128).optional(),
});
export const chatCreateUploadResponseSchema = z.object({
  uploadId: z.uuid(),
  /** PUT the file here with exactly these headers. */
  uploadUrl: z.string(),
  headers: z.record(z.string(), z.string()),
  /** True when the URL is the API itself (development without object storage). */
  viaApi: z.boolean(),
});
export const chatUploadParamsSchema = z.strictObject({ uploadId: z.uuid() });
export const chatCompleteUploadResponseSchema = z.object({
  attachment: chatAttachmentSchema,
});
export const chatReadUploadQuerySchema = z.strictObject({
  download: z.enum(["1", "0"]).optional(),
});

export const chatSenderSchema = chatPersonSchema.extend({
  role: chatSenderRoleSchema,
});

export const chatMessageSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  seq: z.number().int(),
  eventSeq: z.number().int(),
  kind: z.enum(["text", "system"]),
  sender: chatSenderSchema.nullable(),
  /** Empty when deleted. */
  body: z.string(),
  replyTo: z
    .object({
      seq: z.number().int(),
      senderName: z.string().nullable(),
      preview: z.string(),
      deleted: z.boolean(),
    })
    .nullable(),
  mentions: z.array(z.uuid()),
  mentionAll: z.boolean(),
  /** Emoji → count. */
  reactions: z.record(z.string(), z.number().int()),
  /** Photos, videos, voice messages and documents (empty when deleted). */
  attachments: z.array(chatAttachmentSchema),
  pinned: z.boolean(),
  createdAt: isoDate,
  editedAt: isoDate.nullable(),
  /** "This message was deleted" / "…deleted by admin X". */
  deleted: z
    .object({
      by: z.enum(["self", "admin", "purge"]),
      byName: z.string().nullable(),
      /** Staff may restore an admin deletion for a few days. */
      restorable: z.boolean(),
    })
    .nullable(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRestrictionSummarySchema = z.object({
  type: chatRestrictionTypeSchema,
  until: isoDate.nullable(),
  platformWide: z.boolean(),
});

export const chatRoomSummarySchema = z.object({
  id: z.uuid(),
  kind: chatRoomKindSchema,
  title: z.string(),
  courseId: z.uuid().nullable(),
  /** Private chats: the other person. */
  peer: chatSenderSchema.nullable(),
  directStatus: chatDirectStatusSchema.nullable(),
  /** Private chat requests: whether you sent it (waiting) or received it. */
  requestedByMe: z.boolean().nullable(),
  postingPolicy: chatPostingPolicySchema,
  slowModeSeconds: z.number().int(),
  status: chatRoomStatusSchema,
  lastSeq: z.number().int(),
  lastEventSeq: z.number().int(),
  lastMessage: z
    .object({
      seq: z.number().int(),
      senderId: z.uuid().nullable(),
      senderName: z.string().nullable(),
      preview: z.string(),
      deleted: z.boolean(),
      createdAt: isoDate,
    })
    .nullable(),
  lastMessageAt: isoDate.nullable(),
  unreadCount: z.number().int(),
  /**
   * How far the others have received and read your messages (the ticks).
   * Private chats: the other person (read is null when either of you turned
   * read receipts off). Groups: everyone else in the group (WhatsApp: two
   * ticks once all have it, blue once all read it); null with nobody else.
   */
  peerDeliveredSeq: z.number().int().nullable(),
  peerReadSeq: z.number().int().nullable(),
  me: z.object({
    roomRole: chatRoomRoleSchema,
    notifyLevel: chatNotifyLevelSchema,
    archived: z.boolean(),
    pinned: z.boolean(),
    lastReadSeq: z.number().int(),
    canPost: z.boolean(),
    /** Why posting is off, for the bar that replaces the message box. */
    cannotPostReason: z
      .enum([
        "staff_only",
        "locked",
        "archived",
        "muted",
        "request_pending",
        "request_declined",
        "direct_not_allowed",
        "blocked",
        /** Reading an open free course's group without having joined it. */
        "not_joined",
      ])
      .nullable(),
    canModerate: z.boolean(),
    isHelper: z.boolean(),
    restriction: chatRestrictionSummarySchema.nullable(),
  }),
});
export type ChatRoomSummary = z.infer<typeof chatRoomSummarySchema>;

export const chatRoomListQuerySchema = z.strictObject({
  archived: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const chatRoomListResponseSchema = z.object({
  rooms: z.array(chatRoomSummarySchema),
  /** Private chat requests waiting for you. */
  requestsCount: z.number().int(),
  unreadTotal: z.number().int(),
});

export const chatRoomDetailSchema = chatRoomSummarySchema.extend({
  description: z.string().nullable(),
  directMessagesAllowed: z.boolean(),
  attachmentsAllowed: z.boolean(),
  memberCount: z.number().int().nullable(),
  pinnedMessages: z.array(chatMessageSchema),
  /** Groups: a few members' names for the header ("You, Asha, Ravi…"). */
  memberNames: z.array(z.string()),
  /**
   * Private chats: the other person's "online" / "last seen". Null when
   * either of you hides it (Settings › Privacy), as in WhatsApp.
   */
  peerPresence: z
    .object({ online: z.boolean(), lastSeenAt: isoDate.nullable() })
    .nullable(),
});
export type ChatRoomDetail = z.infer<typeof chatRoomDetailSchema>;

/** Message info for your own message: who has read and received it. */
/** A person in Message info, with when it reached them (null: not known). */
export const chatReceiptPersonSchema = chatPersonSchema.extend({
  at: isoDate.nullable(),
});
export const chatMessageInfoSchema = z.object({
  readBy: z.array(chatReceiptPersonSchema),
  deliveredTo: z.array(chatReceiptPersonSchema),
  /** Members it has not reached yet. */
  waiting: z.number().int(),
  /** Read receipts are off for this private chat (yours or theirs). */
  receiptsHidden: z.boolean(),
});
export type ChatMessageInfo = z.infer<typeof chatMessageInfoSchema>;

/** Your chat privacy and preferences (WhatsApp Settings › Privacy, Chats). */
export const chatProfileSchema = z.object({
  showPresence: z.boolean(),
  readReceipts: z.boolean(),
  enterToSend: z.boolean(),
});
export type ChatProfile = z.infer<typeof chatProfileSchema>;
export const updateChatProfileRequestSchema = chatProfileSchema
  .partial()
  .strict();
export type UpdateChatProfileRequest = z.infer<
  typeof updateChatProfileRequestSchema
>;

/** "Search in this chat": words anywhere in a message, newest first. */
export const chatMessageSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(2).max(100),
  before: seqSchema.optional(),
});
export const chatMessageSearchResponseSchema = z.object({
  messages: z.array(chatMessageSchema),
  hasMore: z.boolean(),
});
export type ChatMessageSearchResponse = z.infer<
  typeof chatMessageSearchResponseSchema
>;

export const chatMessageListQuerySchema = z.strictObject({
  before: seqSchema.optional(),
  after: sinceSchema.optional(),
  /** Messages around this one (jump to a reply or search hit). */
  around: seqSchema.optional(),
  limit: z.coerce.number().int().min(1).max(CHAT_PAGE_MAX).optional(),
});
export const chatMessageListResponseSchema = z.object({
  messages: z.array(chatMessageSchema),
  hasMoreBefore: z.boolean(),
  hasMoreAfter: z.boolean(),
  lastSeq: z.number().int(),
  lastEventSeq: z.number().int(),
  /** The oldest message still kept (older ones were removed by retention). */
  oldestSeq: z.number().int().nullable(),
});

export const chatChangesQuerySchema = z.strictObject({ since: sinceSchema });
export const chatChangesResponseSchema = z.object({
  /** Too far behind (or behind the retention window): reload the latest page. */
  reset: z.boolean(),
  messages: z.array(chatMessageSchema),
  lastSeq: z.number().int(),
  lastEventSeq: z.number().int(),
});

export const chatSendMessageRequestSchema = z
  .strictObject({
    clientId: z.uuid(),
    /** The text, or a caption when files are attached (then it may be empty). */
    body: z.string().trim().max(CHAT_BODY_MAX_CHARS).default(""),
    replyToSeq: seqSchema.optional(),
    mentions: z.array(z.uuid()).max(50).optional(),
    mentionAll: z.boolean().optional(),
    /** Uploads finished with POST /chat/uploads/:id/complete. */
    attachmentIds: z
      .array(z.uuid())
      .max(CHAT_MAX_ATTACHMENTS_PER_MESSAGE)
      .optional(),
  })
  .refine(
    (value) => value.body.length > 0 || (value.attachmentIds?.length ?? 0) > 0,
    { message: "A message needs text or a file", path: ["body"] },
  );
export type ChatSendMessageRequest = z.infer<
  typeof chatSendMessageRequestSchema
>;
export const chatSendMessageResponseSchema = z.object({
  message: chatMessageSchema,
  /** The same client id was sent before: this is the stored message. */
  duplicate: z.boolean(),
});

export const chatEditMessageRequestSchema = z.strictObject({
  body: z.string().trim().min(1).max(CHAT_BODY_MAX_CHARS),
});
export const chatDeleteMessageQuerySchema = z.strictObject({
  for: z.enum(["everyone", "me"]).default("everyone"),
});
export const chatReactionRequestSchema = z.strictObject({
  /** null removes your reaction. One reaction per person, like WhatsApp. */
  emoji: z.string().trim().min(1).max(16).nullable(),
});
export const chatMessageResponseSchema = z.object({
  message: chatMessageSchema,
});
export const chatOkResponseSchema = z.object({ ok: z.literal(true) });

export const chatReceiptsRequestSchema = z.strictObject({
  receipts: z
    .array(
      z.strictObject({
        roomId: z.uuid(),
        readSeq: sinceSchema.optional(),
        deliveredSeq: sinceSchema.optional(),
      }),
    )
    .min(1)
    .max(CHAT_RECEIPTS_MAX),
});

export const chatMemberStateRequestSchema = z
  .strictObject({
    notifyLevel: chatNotifyLevelSchema.optional(),
    archived: z.boolean().optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const chatRoomSettingsRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    postingPolicy: chatPostingPolicySchema.optional(),
    slowModeSeconds: z.number().int().min(0).max(3_600).optional(),
    directMessagesAllowed: z.boolean().optional(),
    attachmentsAllowed: z.boolean().optional(),
    status: chatRoomStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const chatCreateTeamRoomRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).optional(),
  memberIds: z.array(z.uuid()).max(CHAT_TEAM_ROOM_MAX_MEMBERS).default([]),
});
export const chatTeamMembersRequestSchema = z.strictObject({
  userIds: z.array(z.uuid()).min(1).max(CHAT_TEAM_ROOM_MAX_MEMBERS),
});

export const chatRoomResponseSchema = z.object({ room: chatRoomDetailSchema });

export const chatMemberListQuerySchema = z.strictObject({
  search: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const chatMemberSchema = chatPersonSchema.extend({
  role: chatSenderRoleSchema,
  /** Group admin (staff) or helper, for the member list tag. */
  isAdmin: z.boolean(),
  isHelper: z.boolean(),
});
export const chatMemberListResponseSchema = z.object({
  members: z.array(chatMemberSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nullable(),
});

export const chatStartDirectRequestSchema = z.strictObject({
  userId: z.uuid(),
});
export const chatStartDirectResponseSchema = z.object({
  room: chatRoomDetailSchema,
  created: z.boolean(),
});

export const chatCandidatesQuerySchema = z.strictObject({
  search: z.string().trim().max(80).optional(),
});
export const chatCandidatesResponseSchema = z.object({
  /** With a search: everyone found whom you may message. */
  results: z.array(chatSenderSchema),
  staff: z.array(chatSenderSchema),
  courses: z.array(
    z.object({
      courseId: z.uuid(),
      title: z.string(),
      /** The instructor allows private chats between learners here. */
      directAllowed: z.boolean(),
      people: z.array(chatSenderSchema),
    }),
  ),
});

export const chatBlockListResponseSchema = z.object({
  blocked: z.array(chatPersonSchema.extend({ blockedAt: isoDate })),
});

export const chatCreateRestrictionRequestSchema = z.strictObject({
  userId: z.uuid(),
  /** Omitted or null: across all chats (instructors and admins only). */
  roomId: z.uuid().nullable().optional(),
  type: chatRestrictionTypeSchema,
  /** Omitted or null: until lifted. */
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24 * 365)
    .nullable()
    .optional(),
  reason: chatReasonSchema,
  note: z.string().trim().max(500).optional(),
});
export const chatRestrictionSchema = z.object({
  id: z.uuid(),
  user: chatPersonSchema,
  roomId: z.uuid().nullable(),
  roomTitle: z.string().nullable(),
  type: chatRestrictionTypeSchema,
  until: isoDate.nullable(),
  reason: chatReasonSchema,
  note: z.string().nullable(),
  createdBy: chatPersonSchema.nullable(),
  createdAt: isoDate,
  revokedAt: isoDate.nullable(),
});
export const chatRestrictionResponseSchema = z.object({
  restriction: chatRestrictionSchema,
});
export const chatRestrictionListQuerySchema = z.strictObject({
  roomId: z.uuid().optional(),
  platform: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  active: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
export const chatRestrictionListResponseSchema = z.object({
  restrictions: z.array(chatRestrictionSchema),
});

export const chatReportRequestSchema = z.strictObject({
  reason: chatReasonSchema,
  details: z.string().trim().max(1_000).optional(),
  /** Also block the sender (you stop seeing their messages). */
  block: z.boolean().optional(),
});
export const chatReportSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  roomKind: chatRoomKindSchema,
  roomTitle: z.string(),
  seq: z.number().int(),
  reason: chatReasonSchema,
  details: z.string().nullable(),
  reportedUser: chatPersonSchema.nullable(),
  reporter: chatPersonSchema.nullable(),
  /** Same message reported by others. */
  reportCount: z.number().int(),
  snapshot: z.object({
    senderName: z.string().nullable(),
    body: z.string(),
    sentAt: isoDate,
    context: z.array(
      z.object({
        seq: z.string(),
        senderName: z.string().nullable(),
        body: z.string(),
      }),
    ),
  }),
  status: chatReportStatusSchema,
  createdAt: isoDate,
  handledAt: isoDate.nullable(),
});
export const chatReportListQuerySchema = z.strictObject({
  status: chatReportStatusSchema.optional(),
  roomId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const chatReportListResponseSchema = z.object({
  reports: z.array(chatReportSchema),
  nextCursor: z.string().nullable(),
});
export const chatHandleReportRequestSchema = z.strictObject({
  status: z.enum(["actioned", "dismissed"]),
});

export const chatModerationLogQuerySchema = z.strictObject({
  roomId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const chatModerationLogResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      actor: chatPersonSchema.nullable(),
      roomId: z.uuid().nullable(),
      targetUser: chatPersonSchema.nullable(),
      seq: z.number().int().nullable(),
      details: z.record(z.string(), z.unknown()),
      createdAt: isoDate,
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const chatStarListResponseSchema = z.object({
  messages: z.array(
    chatMessageSchema.extend({ roomTitle: z.string(), starredAt: isoDate }),
  ),
});

export const chatSettingsSchema = z.object({
  directPolicy: chatDirectPolicySchema,
  courseRetentionMonths: z.number().int(),
  maxDirectRequestsPerDay: z.number().int(),
  maxHelpersPerRoom: z.number().int(),
});
export type ChatSettings = z.infer<typeof chatSettingsSchema>;
export const chatUpdateSettingsRequestSchema = z
  .strictObject({
    directPolicy: chatDirectPolicySchema.optional(),
    courseRetentionMonths: z.number().int().min(1).max(120).optional(),
    maxDirectRequestsPerDay: z.number().int().min(0).max(1_000).optional(),
    maxHelpersPerRoom: z.number().int().min(0).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");
export const chatSettingsResponseSchema = z.object({
  settings: chatSettingsSchema,
});

/**
 * Events on GET /chat/stream (`event:` name → `data:` JSON). The stream
 * also carries `notifications.changed`, so a tab needs only this one.
 */
export const chatStreamEventNames = [
  "ready",
  "chat.message",
  "chat.message_updated",
  "chat.read",
  "chat.typing",
  "chat.group_read",
  "chat.presence",
  "chat.room_updated",
  "chat.room_added",
  "chat.removed",
  "resync",
  "notifications.changed",
] as const;
export type ChatStreamEventName = (typeof chatStreamEventNames)[number];

export interface ChatStreamReadyEvent {
  connectionId: string;
  serverTime: string;
  /** Your chats' heads: fetch changes only for chats ahead of what you have. */
  rooms: Array<{ id: string; lastSeq: number; lastEventSeq: number }>;
}
export interface ChatStreamPointer {
  roomId: string;
  seq: number;
  eventSeq: number;
  /** The event was too big to carry the message: fetch it. */
  pointer: true;
}
export interface ChatStreamReadEvent {
  roomId: string;
  userId: string;
  readSeq: number;
  deliveredSeq: number;
}
/** A group's "everyone has received / read up to" moved (ticks). */
export interface ChatStreamGroupReadEvent {
  roomId: string;
  deliveredSeq: number;
  readSeq: number;
}
/** Someone you have a private chat with came online or went away. */
export interface ChatStreamPresenceEvent {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}
export interface ChatStreamTypingEvent {
  roomId: string;
  userId: string;
  name: string;
}

export type ChatChangesResponse = z.infer<typeof chatChangesResponseSchema>;
export type ChatMessageListResponse = z.infer<
  typeof chatMessageListResponseSchema
>;

export type ChatReport = z.infer<typeof chatReportSchema>;
export type ChatRestriction = z.infer<typeof chatRestrictionSchema>;
