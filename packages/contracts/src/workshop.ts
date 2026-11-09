import { z } from "zod";

/**
 * Workshops: live sessions on Zoom, Google Meet, YouTube Live or any link
 * the host pastes. The platform owns the page, registration, reminders,
 * the join button and the recording; the meeting itself runs elsewhere.
 *
 * Step 1 (this file): what the admin creates, lists and publishes.
 */

export const workshopStatuses = ["draft", "published", "cancelled"] as const;
export const workshopStatusSchema = z.enum(workshopStatuses);
export type WorkshopStatus = z.infer<typeof workshopStatusSchema>;

/** The admin list's tabs. "upcoming" and "past" are published workshops. */
export const workshopAdminTabs = [
  "upcoming",
  "past",
  "drafts",
  "cancelled",
] as const;
export const workshopAdminTabSchema = z.enum(workshopAdminTabs);
export type WorkshopAdminTab = z.infer<typeof workshopAdminTabSchema>;

/** Addresses under /workshops that are pages of their own, never a slug. */
export const WORKSHOP_RESERVED_SLUGS = [
  "admin",
  "manage",
  "create",
  "new",
] as const;

export const workshopSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and hyphens, like react-performance-day",
  )
  .refine(
    (slug) => !(WORKSHOP_RESERVED_SLUGS as readonly string[]).includes(slug),
    { message: "This address is reserved" },
  );

export const workshopTimeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (zone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    },
    { message: "timeZone must be a valid IANA time zone identifier" },
  );

export const WORKSHOP_DEFAULT_TIME_ZONE = "Asia/Kolkata";
export const WORKSHOP_DEFAULT_CURRENCY = "INR";
/** Minutes before a session starts that its Join button appears. */
export const WORKSHOP_JOIN_OPENS_MINUTES_BEFORE = 15;

/**
 * Where a session is in time. Never stored: computed from the clock against
 * `startsAt` and `endsAt`, so nothing has to flip it.
 */
export const workshopSessionStates = [
  "upcoming",
  "join_open",
  "live",
  "ended",
] as const;
export const workshopSessionStateSchema = z.enum(workshopSessionStates);
export type WorkshopSessionState = z.infer<typeof workshopSessionStateSchema>;

export function workshopSessionState(
  startsAt: string | Date,
  endsAt: string | Date,
  now: Date = new Date(),
): WorkshopSessionState {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const time = now.getTime();
  if (time >= end) return "ended";
  if (time >= start) return "live";
  if (time >= start - WORKSHOP_JOIN_OPENS_MINUTES_BEFORE * 60_000) {
    return "join_open";
  }
  return "upcoming";
}

/** A link shown with the workshop (slides, repo, reading). Files come later. */
export const workshopResourceSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  url: z.url().max(2048),
});
export type WorkshopResource = z.infer<typeof workshopResourceSchema>;

/** A session as the admin form sends it. `id` names an existing session. */
export const workshopSessionInputSchema = z
  .strictObject({
    id: z.uuid().optional(),
    title: z.string().trim().max(160).nullable().optional(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    timeZone: workshopTimeZoneSchema,
    /** The meeting link (Zoom, Meet, YouTube Live, ...). Needed to publish. */
    joinUrl: z.url().max(2048).nullable().optional(),
    passcode: z.string().trim().max(64).nullable().optional(),
  })
  .refine(
    (session) =>
      new Date(session.endsAt).getTime() > new Date(session.startsAt).getTime(),
    { message: "A session must end after it starts", path: ["endsAt"] },
  );
export type WorkshopSessionInput = z.infer<typeof workshopSessionInputSchema>;

/** A session as the admin sees it, meeting link included. */
export const workshopSessionAdminSchema = z.strictObject({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  title: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timeZone: z.string(),
  joinUrl: z.string().nullable(),
  passcode: z.string().nullable(),
  recordingMediaId: z.uuid().nullable(),
  recordingReadyAt: z.iso.datetime().nullable(),
  state: workshopSessionStateSchema,
});
export type WorkshopSessionAdmin = z.infer<typeof workshopSessionAdminSchema>;

export const workshopHostSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type WorkshopHost = z.infer<typeof workshopHostSchema>;

export const workshopAdminSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  coverMediaId: z.uuid().nullable(),
  host: workshopHostSchema,
  status: workshopStatusSchema,
  /** Null: open to every learner. Set: only that course's learners. */
  courseId: z.uuid().nullable(),
  courseTitle: z.string().nullable(),
  /** Null: free. */
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3),
  /** Null: unlimited seats. */
  capacity: z.number().int().positive().nullable(),
  resources: z.array(workshopResourceSchema),
  cancelReason: z.string().nullable(),
  sessions: z.array(workshopSessionAdminSchema),
  registrationCount: z.number().int().nonnegative(),
  publishedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type WorkshopAdmin = z.infer<typeof workshopAdminSchema>;

export const workshopAdminListItemSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  status: workshopStatusSchema,
  coverUrl: z.string().nullable(),
  host: workshopHostSchema,
  courseTitle: z.string().nullable(),
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3),
  capacity: z.number().int().positive().nullable(),
  sessionCount: z.number().int().nonnegative(),
  /** The next session still to start, or the first one when all have ended. */
  nextSessionAt: z.iso.datetime().nullable(),
  lastSessionEndsAt: z.iso.datetime().nullable(),
  registrationCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type WorkshopAdminListItem = z.infer<typeof workshopAdminListItemSchema>;

export const workshopAdminListQuerySchema = z.strictObject({
  tab: workshopAdminTabSchema.default("upcoming"),
  search: z.string().trim().min(1).max(120).optional(),
});
export type WorkshopAdminListQuery = z.output<
  typeof workshopAdminListQuerySchema
>;

export const workshopAdminListResponseSchema = z.strictObject({
  items: z.array(workshopAdminListItemSchema),
  counts: z.strictObject({
    upcoming: z.number().int().nonnegative(),
    past: z.number().int().nonnegative(),
    drafts: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  }),
});
export type WorkshopAdminListResponse = z.infer<
  typeof workshopAdminListResponseSchema
>;

export const createWorkshopRequestSchema = z.strictObject({
  title: z.string().trim().min(3).max(160),
  /** Derived from the title when left out. */
  slug: workshopSlugSchema.optional(),
  summary: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  coverMediaId: z.uuid().nullable().optional(),
  coverUrl: z.url().max(2048).nullable().optional(),
  /** A team member; the creator when left out. */
  hostUserId: z.uuid().optional(),
  courseId: z.uuid().nullable().optional(),
  priceMinor: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  capacity: z.number().int().positive().max(100_000).nullable().optional(),
  resources: z.array(workshopResourceSchema).max(20).optional(),
  sessions: z.array(workshopSessionInputSchema).max(30).optional(),
});
export type CreateWorkshopRequest = z.infer<typeof createWorkshopRequestSchema>;

export const updateWorkshopRequestSchema = z.strictObject({
  title: z.string().trim().min(3).max(160).optional(),
  slug: workshopSlugSchema.optional(),
  summary: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  coverMediaId: z.uuid().nullable().optional(),
  coverUrl: z.url().max(2048).nullable().optional(),
  hostUserId: z.uuid().optional(),
  courseId: z.uuid().nullable().optional(),
  priceMinor: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  capacity: z.number().int().positive().max(100_000).nullable().optional(),
  resources: z.array(workshopResourceSchema).max(20).optional(),
  /**
   * The whole set of sessions: ones with an `id` are updated, ones without
   * are added, and sessions missing from the list are removed.
   */
  sessions: z.array(workshopSessionInputSchema).max(30).optional(),
});
export type UpdateWorkshopRequest = z.infer<typeof updateWorkshopRequestSchema>;

export const cancelWorkshopRequestSchema = z.strictObject({
  /** Told to every registrant. */
  reason: z.string().trim().min(3).max(500),
});
export type CancelWorkshopRequest = z.infer<typeof cancelWorkshopRequestSchema>;

export const workshopIdParamsSchema = z.strictObject({
  workshopId: z.uuid(),
});

/** What stops a draft from being published, field by field. */
export const workshopPublishIssueSchema = z.strictObject({
  field: z.enum(["title", "summary", "sessions", "joinUrl", "price", "slug"]),
  message: z.string(),
});
export const workshopPublishCheckSchema = z.strictObject({
  canPublish: z.boolean(),
  issues: z.array(workshopPublishIssueSchema),
});
export type WorkshopPublishCheck = z.infer<typeof workshopPublishCheckSchema>;
export type WorkshopPublishIssue = z.infer<typeof workshopPublishIssueSchema>;

export const workshopDeletedResponseSchema = z.strictObject({
  deleted: z.literal(true),
});
