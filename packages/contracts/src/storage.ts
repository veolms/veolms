import { z } from "zod";

/**
 * Learners' storage: the space each learner's files may take (chat photos,
 * videos, voice and documents; discussion and note attachments; support
 * attachments). 2 GB unless an admin changes the default or gives one
 * person more. Staff (any role beyond student) are not limited.
 */
export const STORAGE_GB = 1024 * 1024 * 1024;
export const STORAGE_DEFAULT_LIMIT_BYTES = 2 * STORAGE_GB;
/** The most an admin may give one person (a typo guard, not a plan). */
export const STORAGE_MAX_LIMIT_BYTES = 10 * 1024 * STORAGE_GB;
/** From this share of the limit the learner is told space is running out. */
export const STORAGE_NEAR_FULL_RATIO = 0.9;
export const STORAGE_NOTE_MAX_LENGTH = 500;

/** Error codes an upload start answers with (HTTP 403). */
export const STORAGE_FULL_ERROR = "STORAGE_FULL";
export const STORAGE_BLOCKED_ERROR = "STORAGE_BLOCKED";
export const storageErrorCodes = [
  STORAGE_FULL_ERROR,
  STORAGE_BLOCKED_ERROR,
] as const;
export type StorageErrorCode = (typeof storageErrorCodes)[number];

export function isStorageErrorCode(code: unknown): code is StorageErrorCode {
  return code === STORAGE_FULL_ERROR || code === STORAGE_BLOCKED_ERROR;
}

const limitBytesSchema = z
  .number()
  .int()
  .min(0)
  .max(STORAGE_MAX_LIMIT_BYTES)
  .describe("Bytes. 2 GB is 2147483648.");

const noteSchema = z.string().trim().max(STORAGE_NOTE_MAX_LENGTH);

export const storageStateSchema = z
  .enum(["ok", "near_full", "full", "blocked", "unlimited"])
  .describe(
    "`near_full` from 90%; `full` when nothing more fits; `unlimited` for staff.",
  );
export type StorageState = z.output<typeof storageStateSchema>;

export const storageRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "declined",
  "cancelled",
]);
export type StorageRequestStatus = z.output<typeof storageRequestStatusSchema>;

export const storageRequestSchema = z.object({
  id: z.uuid(),
  status: storageRequestStatusSchema,
  note: z.string().nullable(),
  /** Space used and the limit when the request was made. */
  usedBytes: z.number().int(),
  limitBytes: z.number().int(),
  grantedLimitBytes: z.number().int().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type StorageRequest = z.output<typeof storageRequestSchema>;

/** What each kind of file takes, for "where did my space go". */
export const storageBreakdownSchema = z.object({
  chatBytes: z.number().int(),
  discussionBytes: z.number().int(),
  supportBytes: z.number().int(),
});
export type StorageBreakdown = z.output<typeof storageBreakdownSchema>;

export const myStorageResponseSchema = z.object({
  state: storageStateSchema,
  usedBytes: z.number().int(),
  /** Null for staff (no limit). */
  limitBytes: z.number().int().nullable(),
  breakdown: storageBreakdownSchema,
  blocked: z
    .object({ at: z.string(), reason: z.string().nullable() })
    .nullable(),
  /** The open request, else the latest one decided in the last 30 days. */
  request: storageRequestSchema.nullable(),
});
export type MyStorageResponse = z.output<typeof myStorageResponseSchema>;

export const createStorageRequestSchema = z.object({
  note: noteSchema.optional(),
});
export type CreateStorageRequest = z.input<typeof createStorageRequestSchema>;

export const storageRequestResponseSchema = z.object({
  request: storageRequestSchema,
});
export type StorageRequestResponse = z.output<
  typeof storageRequestResponseSchema
>;

// ------------------------------------------------------------ my files
/** Where a file was sent: a chat, a discussion or note, or support. */
export const storageFileSourceSchema = z.enum([
  "chat",
  "discussion",
  "support",
]);
export type StorageFileSource = z.output<typeof storageFileSourceSchema>;

export const storageFileKindSchema = z.enum([
  "image",
  "video",
  "audio",
  "file",
]);
export type StorageFileKind = z.output<typeof storageFileKindSchema>;

export const storageFileSortSchema = z.enum(["largest", "oldest", "newest"]);
export type StorageFileSort = z.output<typeof storageFileSortSchema>;

export const STORAGE_FILES_PAGE_SIZE_MAX = 100;
/** The most files one delete takes. */
export const STORAGE_FILES_DELETE_MAX = 100;

export const storageFilesQuerySchema = z.object({
  sort: storageFileSortSchema.default("largest"),
  kind: storageFileKindSchema.optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(STORAGE_FILES_PAGE_SIZE_MAX)
    .default(30),
});
export type StorageFilesQuery = z.input<typeof storageFilesQuerySchema>;

/** One of the learner's own files that takes space. */
export const storageFileSchema = z.object({
  source: storageFileSourceSchema,
  id: z.uuid(),
  kind: storageFileKindSchema,
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
  /** Where it was sent: the chat's name, the lesson, the support ticket. */
  place: z.string().nullable(),
  /** Not sent yet (a chat upload that never went). */
  unsent: z.boolean(),
  /**
   * Where the web app reads the file (a photo, a video), with the session
   * cookie: an API path (`/v1/...`) or a full address. Null for files that
   * cannot be opened (not sent, still uploading).
   */
  url: z.string().nullable(),
  /** A video's or voice message's length. */
  durationMs: z.number().int().nullable(),
});
export type StorageFile = z.output<typeof storageFileSchema>;

/** How many files of one kind, and the space they take. */
export const storageFileKindTotalSchema = z.object({
  kind: storageFileKindSchema,
  count: z.number().int(),
  bytes: z.number().int(),
});
export type StorageFileKindTotal = z.output<typeof storageFileKindTotalSchema>;

export const storageFilesResponseSchema = z.object({
  files: z.array(storageFileSchema),
  /** Files matching the kind filter, and the space they take. */
  total: z.number().int(),
  totalBytes: z.number().int(),
  /** All the learner's files per kind (photos, videos, voice, documents). */
  kinds: z.array(storageFileKindTotalSchema),
});
export type StorageFilesResponse = z.output<typeof storageFilesResponseSchema>;

export const deleteStorageFilesRequestSchema = z.object({
  files: z
    .array(z.object({ source: storageFileSourceSchema, id: z.uuid() }))
    .min(1)
    .max(STORAGE_FILES_DELETE_MAX),
});
export type DeleteStorageFilesRequest = z.input<
  typeof deleteStorageFilesRequestSchema
>;

export const deleteStorageFilesResponseSchema = z.object({
  /** Files deleted (others were not the learner's, or already gone). */
  deleted: z.number().int(),
  freedBytes: z.number().int(),
});
export type DeleteStorageFilesResponse = z.output<
  typeof deleteStorageFilesResponseSchema
>;

// ----------------------------------------------------------------- admin
export const storageLearnerFilterSchema = z.enum([
  "all",
  "requested",
  "near_full",
  "full",
  "blocked",
  "custom",
]);
export type StorageLearnerFilter = z.output<typeof storageLearnerFilterSchema>;

export const storageLearnerSortSchema = z.enum([
  "used",
  "percent",
  "name",
  "last_upload",
  "requested",
]);
export type StorageLearnerSort = z.output<typeof storageLearnerSortSchema>;

export const STORAGE_PAGE_SIZE_MAX = 100;

export const storageLearnersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  filter: storageLearnerFilterSchema.default("all"),
  sort: storageLearnerSortSchema.default("used"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(STORAGE_PAGE_SIZE_MAX)
    .default(25),
});
export type StorageLearnersQuery = z.input<typeof storageLearnersQuerySchema>;

export const storageLearnerSchema = z.object({
  userId: z.uuid(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  usedBytes: z.number().int(),
  limitBytes: z.number().int(),
  /** True when an admin set this person's limit (not the default). */
  customLimit: z.boolean(),
  percentUsed: z.number(),
  lastUploadAt: z.string().nullable(),
  blocked: z
    .object({ at: z.string(), reason: z.string().nullable() })
    .nullable(),
  pendingRequest: storageRequestSchema.nullable(),
});
export type StorageLearner = z.output<typeof storageLearnerSchema>;

export const storageSummarySchema = z.object({
  defaultLimitBytes: z.number().int(),
  learners: z.number().int(),
  totalUsedBytes: z.number().int(),
  pendingRequests: z.number().int(),
  blocked: z.number().int(),
  full: z.number().int(),
});
export type StorageSummary = z.output<typeof storageSummarySchema>;

export const storageLearnersResponseSchema = z.object({
  learners: z.array(storageLearnerSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  summary: storageSummarySchema,
});
export type StorageLearnersResponse = z.output<
  typeof storageLearnersResponseSchema
>;

export const storageEventActionSchema = z.enum([
  "request",
  "cancel_request",
  "approve_request",
  "decline_request",
  "set_limit",
  "reset_limit",
  "block",
  "unblock",
  "recount",
  "set_default_limit",
]);
export type StorageEventAction = z.output<typeof storageEventActionSchema>;

export const storageEventSchema = z.object({
  id: z.uuid(),
  action: storageEventActionSchema,
  actor: z.object({ id: z.uuid(), name: z.string().nullable() }).nullable(),
  fromLimitBytes: z.number().int().nullable(),
  toLimitBytes: z.number().int().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type StorageEvent = z.output<typeof storageEventSchema>;

export const storageLearnerDetailResponseSchema = z.object({
  learner: storageLearnerSchema,
  breakdown: storageBreakdownSchema,
  requests: z.array(storageRequestSchema),
  events: z.array(storageEventSchema),
});
export type StorageLearnerDetailResponse = z.output<
  typeof storageLearnerDetailResponseSchema
>;

export const storageLearnerParamsSchema = z.object({ userId: z.uuid() });
export const storageRequestParamsSchema = z.object({ requestId: z.uuid() });

export const setStorageLimitRequestSchema = z.object({
  /** Null sets the person back to the default. */
  limitBytes: limitBytesSchema.nullable(),
  note: noteSchema.optional(),
});
export type SetStorageLimitRequest = z.input<
  typeof setStorageLimitRequestSchema
>;

export const blockStorageRequestSchema = z.object({
  reason: noteSchema.optional(),
});
export type BlockStorageRequest = z.input<typeof blockStorageRequestSchema>;

export const approveStorageRequestSchema = z.object({
  limitBytes: limitBytesSchema,
  note: noteSchema.optional(),
});
export type ApproveStorageRequest = z.input<typeof approveStorageRequestSchema>;

export const declineStorageRequestSchema = z.object({
  note: noteSchema.optional(),
});
export type DeclineStorageRequest = z.input<typeof declineStorageRequestSchema>;

export const storageLearnerResponseSchema = z.object({
  learner: storageLearnerSchema,
});
export type StorageLearnerResponse = z.output<
  typeof storageLearnerResponseSchema
>;

export const storageSettingsSchema = z.object({
  defaultLimitBytes: z.number().int(),
});
export type StorageSettings = z.output<typeof storageSettingsSchema>;

export const updateStorageSettingsRequestSchema = z.object({
  defaultLimitBytes: limitBytesSchema,
});
export type UpdateStorageSettingsRequest = z.input<
  typeof updateStorageSettingsRequestSchema
>;

/**
 * "1.6 GB", "350 MB", "12 KB": binary units, at most one decimal, rounded
 * down, so space that is not quite full never reads "2 GB of 2 GB".
 */
export function formatStorageBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    unit === 0 || value >= 100
      ? Math.floor(value)
      : Math.floor(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
