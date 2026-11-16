import { z } from "zod";

import {
  afterPurchaseWelcomeInputSchema,
  afterPurchaseWelcomeSchema,
} from "./after-purchase.ts";

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
  /** Course workshops: the lesson the recording was published as. */
  recordingLessonId: z.uuid().nullable(),
  recordingLessonPath: z.string().nullable(),
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
  /** What a buyer reads after paying (the order page and email). */
  welcome: afterPurchaseWelcomeSchema,
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
  /** Who it is for. */
  audience: z.enum(["everyone", "course", "paid"]),
  /** People sent the invitation: its audience, less those not going. */
  invitedCount: z.number().int().nonnegative(),
  /** People who pressed Join at least once. */
  joinedCount: z.number().int().nonnegative(),
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
  welcome: afterPurchaseWelcomeInputSchema.optional(),
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
  welcome: afterPurchaseWelcomeInputSchema.optional(),
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
  /** Refund every paid registration through the normal refund flow. */
  refundPaid: z.boolean().optional(),
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

// --- Step 2: what learners see, and registering ---

/** A session as learners see it: no meeting link, no passcode. */
export const workshopSessionPublicSchema = z.strictObject({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  title: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timeZone: z.string(),
  state: workshopSessionStateSchema,
  hasRecording: z.boolean(),
  /** Course workshops: watch the recording as a lesson of the course. */
  recordingLessonPath: z.string().nullable(),
});
export type WorkshopSessionPublic = z.infer<typeof workshopSessionPublicSchema>;

/** Where the whole workshop is in time, for cards and tabs. */
export const workshopPublicStates = ["upcoming", "live", "ended"] as const;
export const workshopPublicStateSchema = z.enum(workshopPublicStates);
export type WorkshopPublicState = z.infer<typeof workshopPublicStateSchema>;

export const workshopPublicListItemSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  coverUrl: z.string().nullable(),
  host: workshopHostSchema,
  /** Set when only that course's learners may register. */
  courseId: z.uuid().nullable(),
  courseTitle: z.string().nullable(),
  courseSlug: z.string().nullable(),
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3),
  capacity: z.number().int().positive().nullable(),
  /** Null when seats are unlimited. */
  seatsLeft: z.number().int().nonnegative().nullable(),
  registrationCount: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  nextSessionAt: z.iso.datetime().nullable(),
  lastSessionEndsAt: z.iso.datetime().nullable(),
  state: workshopPublicStateSchema,
  /** The next session not yet ended, for a direct Join. */
  nextSessionId: z.uuid().nullable(),
  nextSessionEndsAt: z.iso.datetime().nullable(),
});
export type WorkshopPublicListItem = z.infer<
  typeof workshopPublicListItemSchema
>;

export const workshopPublicListResponseSchema = z.strictObject({
  upcoming: z.array(workshopPublicListItemSchema),
  past: z.array(workshopPublicListItemSchema),
});
export type WorkshopPublicListResponse = z.infer<
  typeof workshopPublicListResponseSchema
>;

export const workshopPublicSchema = workshopPublicListItemSchema.extend({
  description: z.string().nullable(),
  resources: z.array(workshopResourceSchema),
  sessions: z.array(workshopSessionPublicSchema),
  status: z.enum(["published", "cancelled"]),
  cancelReason: z.string().nullable(),
});
export type WorkshopPublic = z.infer<typeof workshopPublicSchema>;

/** Why the Register button is, or is not, offered to this viewer. */
export const workshopRegistrationReasons = [
  "ok",
  "declined",
  "sign_in",
  "registered",
  "course_required",
  "full",
  "payment_required",
  "ended",
  "cancelled",
] as const;
export const workshopRegistrationReasonSchema = z.enum(
  workshopRegistrationReasons,
);
export type WorkshopRegistrationReason = z.infer<
  typeof workshopRegistrationReasonSchema
>;

export const workshopViewerSchema = z.strictObject({
  registered: z.boolean(),
  registeredAt: z.iso.datetime().nullable(),
  joinedSessionIds: z.array(z.uuid()),
  canRegister: z.boolean(),
  reason: workshopRegistrationReasonSchema,
  /** Sessions in their join window, for a registrant; empty otherwise. */
  joinable: z.array(
    z.strictObject({ sessionId: z.uuid(), passcode: z.string().nullable() }),
  ),
  /** Registrants, the linked course's learners and staff may watch recordings. */
  canWatchRecordings: z.boolean(),
  /** In through the workshop's course, not a registration of their own. */
  viaCourse: z.boolean(),
  /** Who the workshop is for. */
  audience: z.enum(["everyone", "course", "paid"]),
  /** Said "I'm not going": no reminders; may still join. */
  declined: z.boolean(),
});
export type WorkshopViewer = z.infer<typeof workshopViewerSchema>;

export const workshopSlugParamsSchema = z.strictObject({
  slug: z.string().min(1).max(80),
});

export const workshopRegistrationResponseSchema = z.strictObject({
  registered: z.literal(true),
  registrationId: z.uuid(),
});
export const workshopUnregisterResponseSchema = z.strictObject({
  registered: z.literal(false),
});

/** The "Add to Google Calendar" link for one session. */
export function googleCalendarUrl(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  details?: string;
  location?: string;
}): string {
  const stamp = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${stamp(input.startsAt)}/${stamp(input.endsAt)}`,
    ...(input.details ? { details: input.details } : {}),
    ...(input.location ? { location: input.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
export type WorkshopRegistrationResponse = z.infer<
  typeof workshopRegistrationResponseSchema
>;

// --- Step 3: reminders and joining ---

export const workshopReminderWindows = ["day", "hour", "now"] as const;
export const workshopReminderWindowSchema = z.enum(workshopReminderWindows);
export type WorkshopReminderWindow = z.infer<
  typeof workshopReminderWindowSchema
>;

/** A session the registrant may join right now, with its passcode if any. */
export const workshopJoinableSessionSchema = z.strictObject({
  sessionId: z.uuid(),
  passcode: z.string().nullable(),
});
export type WorkshopJoinableSession = z.infer<
  typeof workshopJoinableSessionSchema
>;

export const workshopSessionParamsSchema = z.strictObject({
  workshopId: z.uuid(),
  sessionId: z.uuid(),
});

// --- Step 4: recordings ---

/** Attach a processed-or-processing video as the session's recording; null removes it. */
export const setWorkshopRecordingRequestSchema = z.strictObject({
  mediaId: z.uuid().nullable(),
  /** Course workshops: the section of the course the lesson goes in. */
  sectionId: z.uuid().nullable().optional(),
});
export type SetWorkshopRecordingRequest = z.infer<
  typeof setWorkshopRecordingRequestSchema
>;

// --- Step 6: registrants and the home card ---

export const workshopRegistrantSourceSchema = z.enum([
  "free",
  "order",
  "admin",
  "course",
]);

export const workshopRegistrantSchema = z.strictObject({
  registrationId: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** How they got the seat: registered free, paid (an order), or added by staff. */
  source: workshopRegistrantSourceSchema,
  orderId: z.uuid().nullable(),
  registeredAt: z.iso.datetime(),
  /** Sessions they pressed Join on. */
  joinedSessionIds: z.array(z.uuid()),
  /** When they said they are not going; null when they did not. */
  declinedAt: z.iso.datetime().nullable(),
});
export type WorkshopRegistrant = z.infer<typeof workshopRegistrantSchema>;

export const workshopRegistrantsResponseSchema = z.strictObject({
  items: z.array(workshopRegistrantSchema),
  /** All matching rows, for the pager (equal to items.length when not paged). */
  total: z.number().int().nonnegative(),
});
export type WorkshopRegistrantsResponse = z.infer<
  typeof workshopRegistrantsResponseSchema
>;

export const addWorkshopRegistrantRequestSchema = z.strictObject({
  email: z.string().trim().email().max(320),
});
export type AddWorkshopRegistrantRequest = z.infer<
  typeof addWorkshopRegistrantRequestSchema
>;

export const workshopRegistrantParamsSchema = z.strictObject({
  workshopId: z.uuid(),
  userId: z.uuid(),
});

/**
 * The one workshop a learner's home points at: the next session of a
 * workshop they are registered for, or, with none, the soonest upcoming
 * workshop they could still register for.
 */
export const workshopHomeCardSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  coverUrl: z.string().nullable(),
  registered: z.boolean(),
  sessionId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timeZone: z.string(),
  state: workshopSessionStateSchema,
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3),
});
export type WorkshopHomeCard = z.infer<typeof workshopHomeCardSchema>;

/**
 * Publishing an open workshop may tell every learner about it. A course
 * workshop always tells its course's learners on its first publish.
 */
export const publishWorkshopRequestSchema = z.strictObject({
  announce: z.boolean().optional(),
});
export type PublishWorkshopRequest = z.infer<
  typeof publishWorkshopRequestSchema
>;

/** Most rows one CSV import may hold. */
export const WORKSHOP_IMPORT_MAX_ROWS = 2000;

export const importWorkshopRegistrantsRequestSchema = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        email: z.string().trim().max(320),
        name: z.string().trim().max(100).optional(),
      }),
    )
    .min(1)
    .max(WORKSHOP_IMPORT_MAX_ROWS),
  /** Create a student account for an email that has none (default yes). */
  createAccounts: z.boolean().optional(),
});
export type ImportWorkshopRegistrantsRequest = z.infer<
  typeof importWorkshopRegistrantsRequestSchema
>;

export const importWorkshopRegistrantsResponseSchema = z.strictObject({
  /** Newly registered, accounts created for them included. */
  added: z.number().int().nonnegative(),
  /** Of those, how many got a new account. */
  accountsCreated: z.number().int().nonnegative(),
  alreadyRegistered: z.number().int().nonnegative(),
  /** Rows that were not imported, with why (1-based, as in the file). */
  skipped: z.array(
    z.strictObject({
      row: z.number().int().positive(),
      email: z.string(),
      reason: z.enum([
        "invalid_email",
        "no_account",
        "deleted_account",
        "duplicate",
      ]),
    }),
  ),
  items: z.array(workshopRegistrantSchema),
});
export type ImportWorkshopRegistrantsResponse = z.infer<
  typeof importWorkshopRegistrantsResponseSchema
>;

export const workshopCourseSectionsResponseSchema = z.strictObject({
  items: z.array(z.strictObject({ id: z.uuid(), title: z.string() })),
});
export type WorkshopCourseSectionsResponse = z.infer<
  typeof workshopCourseSectionsResponseSchema
>;

export const workshopRegistrantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().min(1).max(120).optional(),
});
export type WorkshopRegistrantsQuery = z.output<
  typeof workshopRegistrantsQuerySchema
>;

/** Rows per page of the attendance list. */
export const WORKSHOP_REGISTRANTS_PAGE_SIZE = 50;

/** Where the signed-in learner stands with each listed workshop. */
export const workshopStandingsResponseSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      workshopId: z.uuid(),
      /** In its audience and not "not going". */
      attending: z.boolean(),
      declined: z.boolean(),
      /** Bought, or in through a course, or open to everyone. */
      via: z.enum(["everyone", "course", "paid", "added"]).nullable(),
    }),
  ),
});
export type WorkshopStandingsResponse = z.infer<
  typeof workshopStandingsResponseSchema
>;
