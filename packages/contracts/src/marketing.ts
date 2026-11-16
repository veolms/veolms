import { z } from "zod";

/**
 * Email marketing (creator-features/34-email-marketing-plan.md): broadcasts
 * written from blocks and sent to a ready audience, six ready automations,
 * and a report per email.
 */

export const MARKETING_NAME_MAX = 120;
export const MARKETING_SUBJECT_MAX = 150;
export const MARKETING_PREHEADER_MAX = 200;
export const MARKETING_BLOCKS_MAX = 40;
export const MARKETING_HEADING_MAX = 200;
export const MARKETING_TEXT_MAX = 5000;
export const MARKETING_BUTTON_LABEL_MAX = 60;
export const MARKETING_URL_MAX = 2000;
export const MARKETING_COURSES_MAX = 50;

/**
 * Stands for the course an automation email is about ("the course you
 * bought"); a button may point at it instead of a fixed address.
 */
export const MARKETING_COURSE_LINK = "{course_link}";

/** The words a creator may put in the subject and text, with fallbacks. */
export const MARKETING_VARIABLES = [
  { token: "{first_name}", label: "First name", fallback: "there" },
  { token: "{full_name}", label: "Full name", fallback: "there" },
  { token: "{academy_name}", label: "Academy name", fallback: "" },
  { token: "{course_title}", label: "Course name", fallback: "your course" },
] as const;

/** An http(s) address, the only kind a marketing email may link to. */
export function isSafeMarketingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const trimmed = (max: number) => z.string().trim().max(max);
const blockId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/u);
const linkUrl = z
  .string()
  .trim()
  .max(MARKETING_URL_MAX)
  .refine(
    (value) => value === MARKETING_COURSE_LINK || isSafeMarketingUrl(value),
    { message: "Use a full web address starting with https://" },
  );
const imageUrl = z
  .string()
  .trim()
  .max(MARKETING_URL_MAX)
  .refine(
    (value) => value.startsWith("https://") && isSafeMarketingUrl(value),
    {
      message: "Use an image address starting with https://",
    },
  );

export const marketingBlockSchema = z.discriminatedUnion("type", [
  z.object({
    id: blockId,
    type: z.literal("heading"),
    text: trimmed(MARKETING_HEADING_MAX).min(1, "Write a heading"),
  }),
  z.object({
    id: blockId,
    type: z.literal("text"),
    text: trimmed(MARKETING_TEXT_MAX).min(1, "Write some text"),
  }),
  z.object({
    id: blockId,
    type: z.literal("button"),
    label: trimmed(MARKETING_BUTTON_LABEL_MAX).min(1, "Name the button"),
    url: linkUrl,
  }),
  z.object({
    id: blockId,
    type: z.literal("image"),
    url: imageUrl,
    alt: trimmed(200).default(""),
    link: linkUrl.nullable().default(null),
  }),
  z.object({ id: blockId, type: z.literal("divider") }),
  z.object({
    id: blockId,
    type: z.literal("spacer"),
    size: z.enum(["small", "medium", "large"]).default("medium"),
  }),
]);
export type MarketingBlock = z.infer<typeof marketingBlockSchema>;
export type MarketingBlockType = MarketingBlock["type"];

export const marketingBlocksSchema = z
  .array(marketingBlockSchema)
  .max(
    MARKETING_BLOCKS_MAX,
    `An email can have up to ${MARKETING_BLOCKS_MAX} blocks`,
  );

// --- Audiences ---

const courseIds = z.array(z.uuid()).max(MARKETING_COURSES_MAX);

/** The ready audiences (the plan's table). */
export const marketingSegmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({
    type: z.literal("bought"),
    courseIds: courseIds.min(1, "Pick a course"),
  }),
  z.object({
    type: z.literal("not_bought"),
    courseIds: courseIds.min(1, "Pick a course"),
  }),
  z.object({
    type: z.literal("workshop"),
    workshopId: z.uuid(),
    attendance: z.enum(["all", "attended", "missed"]).default("all"),
  }),
  z.object({ type: z.literal("new"), days: z.number().int().min(1).max(365) }),
  z.object({
    type: z.literal("inactive"),
    days: z.number().int().min(3).max(365),
  }),
  // No courses: bought any course and never started it.
  z.object({
    type: z.literal("not_started"),
    courseIds: courseIds.default([]),
  }),
  // Was sent an earlier email and did not open it ("Resend").
  z.object({ type: z.literal("not_opened"), emailId: z.uuid() }),
]);
export type MarketingSegment = z.infer<typeof marketingSegmentSchema>;
export type MarketingSegmentType = MarketingSegment["type"];

export const marketingAudienceSchema = z.object({
  segment: marketingSegmentSchema,
  /** Leave out anyone who has any of these courses. */
  excludeCourseIds: courseIds.default([]),
});
export type MarketingAudience = z.infer<typeof marketingAudienceSchema>;

export const DEFAULT_MARKETING_AUDIENCE: MarketingAudience = {
  segment: { type: "all" },
  excludeCourseIds: [],
};

// --- Automations ---

export const MARKETING_AUTOMATION_KEYS = [
  "welcome",
  "purchase_thanks",
  "start_nudge",
  "win_back",
  "access_ending",
  "checkout_reminder",
] as const;
export type MarketingAutomationKey = (typeof MARKETING_AUTOMATION_KEYS)[number];
export const marketingAutomationKeySchema = z.enum(MARKETING_AUTOMATION_KEYS);

/**
 * What each ready automation waits for. `wait` is how long, in the unit
 * shown to the creator; `min`/`max`/`default` are in that unit.
 */
export const MARKETING_AUTOMATIONS: Readonly<
  Record<
    MarketingAutomationKey,
    {
      title: string;
      description: string;
      waitLabel: string;
      unit: "hours" | "days";
      min: number;
      max: number;
      default: number;
      /** Whether the creator may limit it to one course. */
      perCourse: boolean;
      /** Whether the email is about a course ({course_title}, the course link). */
      aboutCourse: boolean;
      stopsWhen: string | null;
    }
  >
> = {
  welcome: {
    title: "Welcome new students",
    description:
      "Say hello when someone joins your academy, and show them where to start.",
    waitLabel: "Send after they join",
    unit: "hours",
    min: 0,
    max: 720,
    default: 0,
    perCourse: false,
    aboutCourse: false,
    stopsWhen: null,
  },
  purchase_thanks: {
    title: "Thank you after buying",
    description:
      "A personal thank-you and next steps a little after someone buys.",
    waitLabel: "Send after they buy",
    unit: "hours",
    min: 0,
    max: 720,
    default: 2,
    perCourse: true,
    aboutCourse: true,
    stopsWhen: null,
  },
  start_nudge: {
    title: "Nudge to start",
    description: "Remind buyers who haven't opened a single lesson yet.",
    waitLabel: "Send if not started after",
    unit: "days",
    min: 1,
    max: 90,
    default: 3,
    perCourse: true,
    aboutCourse: true,
    stopsWhen: "They open a lesson",
  },
  win_back: {
    title: "Win back inactive students",
    description: "Bring back students who stopped learning.",
    waitLabel: "Send after no learning for",
    unit: "days",
    min: 3,
    max: 180,
    default: 14,
    perCourse: false,
    aboutCourse: false,
    stopsWhen: "They learn again",
  },
  access_ending: {
    title: "Access ending soon",
    description:
      "Tell students before their course access ends, so they can finish or renew.",
    waitLabel: "Send before access ends",
    unit: "days",
    min: 1,
    max: 60,
    default: 7,
    perCourse: true,
    aboutCourse: true,
    stopsWhen: "Their access is extended",
  },
  checkout_reminder: {
    title: "Finish your checkout",
    description:
      "Remind people who started paying for a course but didn't finish.",
    waitLabel: "Send after an unpaid checkout",
    unit: "hours",
    min: 1,
    max: 168,
    default: 1,
    perCourse: true,
    aboutCourse: true,
    stopsWhen: "They buy the course",
  },
};

export const marketingAutomationSettingsSchema = z.object({
  /** In the automation's unit (hours or days). */
  wait: z.number().int().min(0).max(720),
  /** Only this course; null for any course. */
  courseId: z.uuid().nullable().default(null),
});
export type MarketingAutomationSettings = z.infer<
  typeof marketingAutomationSettingsSchema
>;

// --- Emails ---

export const MARKETING_EMAIL_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "active",
  "paused",
] as const;
export const marketingEmailStatusSchema = z.enum(MARKETING_EMAIL_STATUSES);
export type MarketingEmailStatus = z.infer<typeof marketingEmailStatusSchema>;

export const marketingEmailStatsSchema = z.object({
  recipients: z.number().int(),
  pending: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  opened: z.number().int(),
  clicked: z.number().int(),
  unsubscribed: z.number().int(),
});
export type MarketingEmailStats = z.infer<typeof marketingEmailStatsSchema>;

export const marketingEmailSummarySchema = z.object({
  id: z.uuid(),
  kind: z.enum(["broadcast", "automation"]),
  automationKey: marketingAutomationKeySchema.nullable(),
  name: z.string(),
  subject: z.string(),
  status: marketingEmailStatusSchema,
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  stats: marketingEmailStatsSchema,
});
export type MarketingEmailSummary = z.infer<typeof marketingEmailSummarySchema>;

export const marketingEmailSchema = marketingEmailSummarySchema.extend({
  preheader: z.string(),
  blocks: marketingBlocksSchema,
  audience: marketingAudienceSchema.nullable(),
  settings: marketingAutomationSettingsSchema.nullable(),
  enabledAt: z.iso.datetime({ offset: true }).nullable(),
  resendOf: z.uuid().nullable(),
});
export type MarketingEmail = z.infer<typeof marketingEmailSchema>;

export const marketingEmailListResponseSchema = z.object({
  emails: z.array(marketingEmailSummarySchema),
});
export type MarketingEmailListResponse = z.infer<
  typeof marketingEmailListResponseSchema
>;

export const MARKETING_TEMPLATE_KEYS = [
  "blank",
  "welcome",
  "launch",
  "workshop",
  "offer",
  "newsletter",
] as const;
export type MarketingTemplateKey = (typeof MARKETING_TEMPLATE_KEYS)[number];

export const createMarketingEmailRequestSchema = z.object({
  template: z.enum(MARKETING_TEMPLATE_KEYS).default("blank"),
});
export type CreateMarketingEmailRequest = z.infer<
  typeof createMarketingEmailRequestSchema
>;

/** A draft's fields; any left out stay as they are. */
export const updateMarketingEmailRequestSchema = z.object({
  name: trimmed(MARKETING_NAME_MAX).min(1, "Name the email").optional(),
  subject: trimmed(MARKETING_SUBJECT_MAX).optional(),
  preheader: trimmed(MARKETING_PREHEADER_MAX).optional(),
  blocks: marketingBlocksSchema.optional(),
  audience: marketingAudienceSchema.optional(),
  settings: marketingAutomationSettingsSchema.optional(),
});
export type UpdateMarketingEmailRequest = z.infer<
  typeof updateMarketingEmailRequestSchema
>;

export const scheduleMarketingEmailRequestSchema = z.object({
  /** Null: send now. */
  sendAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ScheduleMarketingEmailRequest = z.infer<
  typeof scheduleMarketingEmailRequestSchema
>;

export const resendMarketingEmailRequestSchema = z.object({
  subject: trimmed(MARKETING_SUBJECT_MAX).min(1, "Write a subject"),
});
export type ResendMarketingEmailRequest = z.infer<
  typeof resendMarketingEmailRequestSchema
>;

export const marketingPreviewRequestSchema = z.object({
  subject: trimmed(MARKETING_SUBJECT_MAX),
  preheader: trimmed(MARKETING_PREHEADER_MAX),
  /** Unchecked here: a half-written block still previews. */
  blocks: z.array(z.unknown()).max(MARKETING_BLOCKS_MAX),
  automationKey: marketingAutomationKeySchema.nullable().default(null),
});
export type MarketingPreviewRequest = z.infer<
  typeof marketingPreviewRequestSchema
>;

export const marketingPreviewResponseSchema = z.object({
  subject: z.string(),
  html: z.string(),
});
export type MarketingPreviewResponse = z.infer<
  typeof marketingPreviewResponseSchema
>;

export const marketingAudienceCountRequestSchema = z.object({
  audience: marketingAudienceSchema,
});
export const marketingAudienceCountResponseSchema = z.object({
  count: z.number().int(),
});
export type MarketingAudienceCountResponse = z.infer<
  typeof marketingAudienceCountResponseSchema
>;

export const marketingReportSchema = z.object({
  stats: marketingEmailStatsSchema,
  revenue: z.object({
    /** In the smallest unit (paise). */
    amount: z.number().int(),
    currency: z.string(),
    orders: z.number().int(),
  }),
});
export type MarketingReport = z.infer<typeof marketingReportSchema>;

export const MARKETING_RECIPIENT_FILTERS = [
  "all",
  "opened",
  "clicked",
  "not_opened",
  "unsubscribed",
  "failed",
  "skipped",
] as const;
export type MarketingRecipientFilter =
  (typeof MARKETING_RECIPIENT_FILTERS)[number];

export const marketingRecipientsQuerySchema = z.object({
  filter: z.enum(MARKETING_RECIPIENT_FILTERS).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type MarketingRecipientsQuery = z.infer<
  typeof marketingRecipientsQuerySchema
>;

export const marketingRecipientSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  status: z.enum(["pending", "sent", "failed", "skipped"]),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  openedAt: z.iso.datetime({ offset: true }).nullable(),
  clickedAt: z.iso.datetime({ offset: true }).nullable(),
  unsubscribedAt: z.iso.datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
export type MarketingRecipient = z.infer<typeof marketingRecipientSchema>;

export const MARKETING_RECIPIENTS_PAGE_SIZE = 50;

export const marketingRecipientsResponseSchema = z.object({
  recipients: z.array(marketingRecipientSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type MarketingRecipientsResponse = z.infer<
  typeof marketingRecipientsResponseSchema
>;

export const marketingAutomationSchema = z.object({
  key: marketingAutomationKeySchema,
  /** Null until the creator first opens it. */
  email: marketingEmailSummarySchema.nullable(),
  settings: marketingAutomationSettingsSchema,
});
export type MarketingAutomation = z.infer<typeof marketingAutomationSchema>;

export const marketingAutomationListResponseSchema = z.object({
  automations: z.array(marketingAutomationSchema),
});
export type MarketingAutomationListResponse = z.infer<
  typeof marketingAutomationListResponseSchema
>;

export const setMarketingAutomationActiveRequestSchema = z.object({
  active: z.boolean(),
});

/** Fills the variables in a subject or text; unknown words stay as typed. */
export function fillMarketingVariables(
  text: string,
  values: Partial<
    Record<
      "first_name" | "full_name" | "academy_name" | "course_title",
      string | null
    >
  >,
): string {
  return text.replace(
    /\{(first_name|full_name|academy_name|course_title)\}/gu,
    (_match, name: string) => {
      const value = values[name as keyof typeof values]?.trim();
      if (value) return value;
      return (
        MARKETING_VARIABLES.find((variable) => variable.token === `{${name}}`)
          ?.fallback ?? ""
      );
    },
  );
}

/** What stops a draft from being sent, in the creator's words; empty when ready. */
export function marketingEmailProblems(input: {
  subject: string;
  blocks: readonly MarketingBlock[];
}): string[] {
  const problems: string[] = [];
  if (!input.subject.trim()) problems.push("Write a subject line.");
  if (
    !input.blocks.some(
      (block) => block.type !== "divider" && block.type !== "spacer",
    )
  ) {
    problems.push("Add some content to the email.");
  }
  return problems;
}

export const marketingAudienceOptionsResponseSchema = z.object({
  courses: z.array(z.object({ id: z.uuid(), title: z.string() })),
  workshops: z.array(z.object({ id: z.uuid(), title: z.string() })),
});
export type MarketingAudienceOptionsResponse = z.infer<
  typeof marketingAudienceOptionsResponseSchema
>;
