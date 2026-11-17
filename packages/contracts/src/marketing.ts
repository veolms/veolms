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
    (value) =>
      (value.startsWith("https://") || isLocalImageUrl(value)) &&
      isSafeMarketingUrl(value),
    {
      message: "Use an image address starting with https://",
    },
  );

/**
 * An image on this computer's own storage (a local test stack serves it
 * over http). Allowed so uploads can be tried locally; no mail app can
 * load it, so it never matters in a real send.
 */
function isLocalImageUrl(value: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//u.test(value);
}

/** A colour as `#RRGGBB`. */
export const marketingColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/u, "Use a colour like #6E7CFF");

export const MARKETING_ALIGNS = ["left", "center", "right"] as const;
const align = z.enum(MARKETING_ALIGNS);
export type MarketingAlign = (typeof MARKETING_ALIGNS)[number];

export const MARKETING_COUPON_CODE_MAX = 50;
export const MARKETING_CARD_TITLE_MAX = 160;
export const MARKETING_CARD_TEXT_MAX = 600;
export const MARKETING_QUOTE_MAX = 800;
/** Links written into one text block as [words](https://...). */
export const MARKETING_TEXT_LINKS_MAX = 20;

/** Where a card's words came from; "custom" is written by hand. */
export const MARKETING_CARD_SOURCES = ["course", "workshop", "custom"] as const;
export type MarketingCardSource = (typeof MARKETING_CARD_SOURCES)[number];

export const marketingBlockSchema = z.discriminatedUnion("type", [
  z.object({
    id: blockId,
    type: z.literal("heading"),
    text: trimmed(MARKETING_HEADING_MAX).min(1, "Write a heading"),
    size: z.enum(["large", "medium", "small"]).default("large"),
    align: align.default("left"),
  }),
  z.object({
    id: blockId,
    type: z.literal("text"),
    text: trimmed(MARKETING_TEXT_MAX).min(1, "Write some text"),
    align: align.default("left"),
  }),
  z.object({
    id: blockId,
    type: z.literal("button"),
    label: trimmed(MARKETING_BUTTON_LABEL_MAX).min(1, "Name the button"),
    url: linkUrl,
    align: align.default("left"),
    style: z.enum(["filled", "outline"]).default("filled"),
    /** Null: the email's accent colour. */
    color: marketingColorSchema.nullable().default(null),
    fullWidth: z.boolean().default(false),
  }),
  z.object({
    id: blockId,
    type: z.literal("image"),
    url: imageUrl,
    alt: trimmed(200).default(""),
    link: linkUrl.nullable().default(null),
    size: z.enum(["full", "medium", "small"]).default("full"),
    align: align.default("center"),
  }),
  z.object({ id: blockId, type: z.literal("divider") }),
  z.object({
    id: blockId,
    type: z.literal("spacer"),
    size: z.enum(["small", "medium", "large"]).default("medium"),
  }),
  z.object({
    id: blockId,
    type: z.literal("coupon"),
    code: z
      .string()
      .trim()
      .min(1, "Write the coupon code")
      .max(MARKETING_COUPON_CODE_MAX)
      .regex(/^[A-Za-z0-9_-]+$/u, "A code is letters, numbers, - and _ only"),
    title: trimmed(120).default("Your code"),
    /** "Ends 30 November", "20% off any course". */
    note: trimmed(200).default(""),
  }),
  z.object({
    id: blockId,
    type: z.literal("card"),
    source: z.enum(MARKETING_CARD_SOURCES).default("custom"),
    /** The course or workshop it was filled from, for the editor only. */
    sourceId: z.uuid().nullable().default(null),
    title: trimmed(MARKETING_CARD_TITLE_MAX).min(1, "Give the card a title"),
    /** A small line above the title: a date, a price. */
    meta: trimmed(120).default(""),
    text: trimmed(MARKETING_CARD_TEXT_MAX).default(""),
    imageUrl: imageUrl.nullable().default(null),
    url: linkUrl,
    buttonLabel: trimmed(MARKETING_BUTTON_LABEL_MAX).min(1, "Name the button"),
  }),
  z.object({
    id: blockId,
    type: z.literal("quote"),
    text: trimmed(MARKETING_QUOTE_MAX).min(1, "Write the quote"),
    name: trimmed(120).default(""),
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

/** `[words](https://...)` in a text block: a link. */
export const MARKETING_TEXT_LINK_PATTERN =
  /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/gu;

/** The addresses a text block links to, in order (at most the limit). */
export function marketingTextLinks(text: string): string[] {
  return [...text.matchAll(MARKETING_TEXT_LINK_PATTERN)]
    .map((match) => match[2]!)
    .filter(isSafeMarketingUrl)
    .slice(0, MARKETING_TEXT_LINKS_MAX);
}

/**
 * A tracked link's number in an email: the block's place for its own link
 * (a button, an image, a card), and past the blocks for the links written
 * in a text block, so each can be found again from the number alone.
 */
export function marketingLinkNumber(
  blockIndex: number,
  textLink: number | null = null,
): number {
  return textLink === null
    ? blockIndex
    : MARKETING_BLOCKS_MAX * (textLink + 1) + blockIndex;
}

export function readMarketingLinkNumber(number: number): {
  blockIndex: number;
  textLink: number | null;
} {
  if (number < MARKETING_BLOCKS_MAX)
    return { blockIndex: number, textLink: null };
  return {
    blockIndex: number % MARKETING_BLOCKS_MAX,
    textLink: Math.floor(number / MARKETING_BLOCKS_MAX) - 1,
  };
}

// --- Design ---

/** The email's look: a theme, with its accent and font changeable. */
export const MARKETING_THEMES = [
  "midnight",
  "clean",
  "warm",
  "ocean",
  "forest",
  "ember",
] as const;
export type MarketingTheme = (typeof MARKETING_THEMES)[number];

export const MARKETING_FONTS = ["modern", "classic", "rounded"] as const;
export type MarketingFont = (typeof MARKETING_FONTS)[number];

/** Every colour a theme draws an email with (inline styles only). */
export interface MarketingThemeColors {
  page: string;
  card: string;
  cardBorder: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  /** The wordmark's first letter. */
  mark: string;
  divider: string;
  /** A soft panel inside the card: the coupon, the quote. */
  soft: string;
  scheme: "dark" | "light";
}

export const MARKETING_THEME_LABELS: Readonly<Record<MarketingTheme, string>> =
  {
    midnight: "Midnight",
    clean: "Clean",
    warm: "Warm",
    ocean: "Ocean",
    forest: "Forest",
    ember: "Ember",
  };

export const MARKETING_THEME_COLORS: Readonly<
  Record<MarketingTheme, MarketingThemeColors>
> = {
  midnight: {
    page: "#0B0D12",
    card: "#151821",
    cardBorder: "#242936",
    text: "#F3F4F6",
    muted: "#9CA3AF",
    faint: "#6B7280",
    accent: "#6E7CFF",
    mark: "#795CED",
    divider: "#232733",
    soft: "#1C2030",
    scheme: "dark",
  },
  clean: {
    page: "#F3F4F6",
    card: "#FFFFFF",
    cardBorder: "#E5E7EB",
    text: "#111827",
    muted: "#4B5563",
    faint: "#6B7280",
    accent: "#4F46E5",
    mark: "#4F46E5",
    divider: "#E5E7EB",
    soft: "#F5F5FF",
    scheme: "light",
  },
  warm: {
    page: "#F6F1EA",
    card: "#FFFDF9",
    cardBorder: "#EADFD2",
    text: "#2B211A",
    muted: "#5C4D41",
    faint: "#8A7A6C",
    accent: "#D9480F",
    mark: "#D9480F",
    divider: "#EADFD2",
    soft: "#FBF3EA",
    scheme: "light",
  },
  ocean: {
    page: "#E8F2FA",
    card: "#FFFFFF",
    cardBorder: "#D3E5F2",
    text: "#0F2537",
    muted: "#3E5568",
    faint: "#6A8095",
    accent: "#0B72B9",
    mark: "#0B72B9",
    divider: "#D3E5F2",
    soft: "#EFF7FD",
    scheme: "light",
  },
  forest: {
    page: "#EAF2EC",
    card: "#FFFFFF",
    cardBorder: "#D5E4DA",
    text: "#12261A",
    muted: "#3F5747",
    faint: "#6B8274",
    accent: "#15803D",
    mark: "#15803D",
    divider: "#D5E4DA",
    soft: "#F0F7F2",
    scheme: "light",
  },
  ember: {
    page: "#120E0B",
    card: "#1C1714",
    cardBorder: "#2E2620",
    text: "#FAF5EF",
    muted: "#BFB2A5",
    faint: "#8C7F72",
    accent: "#F97316",
    mark: "#F97316",
    divider: "#2E2620",
    soft: "#251E19",
    scheme: "dark",
  },
};

export const marketingDesignSchema = z.object({
  theme: z.enum(MARKETING_THEMES).default("midnight"),
  /** Null: the theme's own accent. */
  accent: marketingColorSchema.nullable().default(null),
  font: z.enum(MARKETING_FONTS).default("modern"),
  /** Where the logo and the footer sit. */
  headerAlign: z.enum(["left", "center"]).default("left"),
});
export type MarketingDesign = z.infer<typeof marketingDesignSchema>;
export const DEFAULT_MARKETING_DESIGN: MarketingDesign = {
  theme: "midnight",
  accent: null,
  font: "modern",
  headerAlign: "left",
};

/** A stored design, or the default when it is missing or broken. */
export function readMarketingDesign(value: unknown): MarketingDesign {
  const parsed = marketingDesignSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_MARKETING_DESIGN;
}

// --- Images and cards ---

export const MARKETING_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
export type MarketingImageContentType =
  (typeof MARKETING_IMAGE_CONTENT_TYPES)[number];
export const MARKETING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const marketingImagePresignRequestSchema = z.strictObject({
  contentType: z.enum(MARKETING_IMAGE_CONTENT_TYPES, {
    message: "Upload a PNG, JPEG, GIF or WebP image",
  }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MARKETING_IMAGE_MAX_BYTES, "The image must be 5 MB or smaller"),
});
export type MarketingImagePresignRequest = z.infer<
  typeof marketingImagePresignRequestSchema
>;
export const marketingImagePresignResponseSchema = z.strictObject({
  uploadId: z.uuid(),
  uploadUrl: z.string(),
});
export type MarketingImagePresignResponse = z.infer<
  typeof marketingImagePresignResponseSchema
>;
export const marketingImageCompleteRequestSchema = z.strictObject({
  uploadId: z.uuid(),
  contentType: z.enum(MARKETING_IMAGE_CONTENT_TYPES),
});
export type MarketingImageCompleteRequest = z.infer<
  typeof marketingImageCompleteRequestSchema
>;
export const marketingImageCompleteResponseSchema = z.strictObject({
  url: z.string(),
});
export type MarketingImageCompleteResponse = z.infer<
  typeof marketingImageCompleteResponseSchema
>;

/** A course's or workshop's words, to fill a card block with. */
export const marketingCardFillSchema = z.object({
  source: z.enum(["course", "workshop"]),
  sourceId: z.uuid(),
  title: z.string(),
  meta: z.string(),
  text: z.string(),
  imageUrl: z.string().nullable(),
  url: z.string(),
  buttonLabel: z.string(),
});
export type MarketingCardFill = z.infer<typeof marketingCardFillSchema>;

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
  design: marketingDesignSchema,
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
  design: marketingDesignSchema.optional(),
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
  design: marketingDesignSchema.default(DEFAULT_MARKETING_DESIGN),
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
