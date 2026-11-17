import { z } from "zod";
import { SITE_MOTION_LEVELS, SITE_THEME_IDS } from "./site-themes.ts";

/**
 * The website builder (creator-features/40-page-builder-and-themes-plan.md).
 *
 * A page is a list of ready sections. Each section has a type, one of that
 * type's layouts, and settings that name roles (`tone: "accent"`,
 * `spacing: "lg"`), never colours or fonts, so a theme can change the whole
 * look without touching the words. Links are typed references (a course, a
 * page) so they survive a slug change. Text is plain: the renderer escapes
 * every character, and raw HTML is never stored.
 */

export const SITE_PAGE_SCHEMA_VERSION = 1;
export const SITE_PAGE_MAX_SECTIONS = 25;

// --- Shared pieces --------------------------------------------------------

/**
 * A section's colour scheme: the page, a soft surface, a tint of the
 * accent, the full brand colour, or dark.
 */
export const SITE_TONES = [
  "default",
  "muted",
  "accent",
  "brand",
  "inverse",
] as const;
export type SiteTone = (typeof SITE_TONES)[number];
export const SITE_SPACINGS = ["sm", "md", "lg"] as const;
export type SiteSpacing = (typeof SITE_SPACINGS)[number];

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => z.string().trim().min(1).max(max);

/**
 * An address the visitor's browser may follow: https, http, mailto, tel, or
 * a path on this site. Anything else (`javascript:`, `data:`, `//host`) is
 * refused, because the page renders it as an `href`.
 */
export const SITE_SAFE_HREF =
  /^(?:https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[0-9 ()-]{3,30}|\/(?!\/)[^\s<>"']*)$/u;

export const siteHrefSchema = z
  .string()
  .trim()
  .max(2000)
  .regex(SITE_SAFE_HREF, "Use a web address that starts with https://");

export const siteLinkSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("url"), href: siteHrefSchema }),
  z.strictObject({ kind: z.literal("course"), courseId: z.uuid() }),
  z.strictObject({ kind: z.literal("page"), pageId: z.uuid() }),
  /** The academy's course catalogue. */
  z.strictObject({ kind: z.literal("courses") }),
]);
export type SiteLink = z.infer<typeof siteLinkSchema>;

export const siteButtonSchema = z.strictObject({
  label: text(60),
  link: siteLinkSchema,
});
export type SiteButton = z.infer<typeof siteButtonSchema>;

/** An image by address, with words for people who can't see it. */
export const siteImageSchema = z.strictObject({
  src: z.union([z.literal(""), siteHrefSchema]),
  alt: text(200),
});
export type SiteImage = z.infer<typeof siteImageSchema>;

const sectionBase = {
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/u),
};

/** How a section comes into view as the visitor scrolls to it. */
export const SITE_ANIMATIONS = [
  "none",
  "fade",
  "fade-up",
  "zoom",
  "slide-left",
  "slide-right",
  "blur",
] as const;
export type SiteAnimation = (typeof SITE_ANIMATIONS)[number];

/** Where a section is left out. */
export const SITE_HIDE_ON = ["none", "phone", "desktop"] as const;
export type SiteHideOn = (typeof SITE_HIDE_ON)[number];

const look = {
  tone: z.enum(SITE_TONES),
  spacing: z.enum(SITE_SPACINGS),
  /** Left out: the theme's motion level decides. */
  animation: z.enum(SITE_ANIMATIONS).optional(),
  hideOn: z.enum(SITE_HIDE_ON).optional(),
};

// --- Sections -------------------------------------------------------------

export const SITE_SECTION_LAYOUTS = {
  hero: ["centered", "split", "banner", "gradient"],
  features: ["grid", "list", "cards", "bento", "steps", "checklist"],
  courses: ["grid", "list", "row"],
  testimonials: ["grid", "spotlight", "wall", "marquee"],
  faq: ["accordion", "columns"],
  cta: ["banner", "card", "split", "gradient"],
  links: ["stack", "pills"],
  footer: ["simple", "columns"],
  header: ["classic", "centered", "minimal"],
  logos: ["grid", "marquee"],
  stats: ["inline", "cards", "band"],
  pricing: ["cards", "single"],
  about: ["left", "right", "centered"],
  countdown: ["banner", "boxes"],
  guarantee: ["badge", "row"],
  video: ["wide", "split"],
  gallery: ["grid", "masonry", "row"],
  text: ["narrow", "columns"],
  buybar: ["bar"],
} as const;

export type SiteSectionType = keyof typeof SITE_SECTION_LAYOUTS;
export const SITE_SECTION_TYPES = Object.keys(
  SITE_SECTION_LAYOUTS,
) as SiteSectionType[];
export type SiteSectionLayout<Type extends SiteSectionType> =
  (typeof SITE_SECTION_LAYOUTS)[Type][number];

const heroSettings = z.strictObject({
  ...look,
  eyebrow: text(80),
  heading: requiredText(140),
  subheading: text(400),
  image: siteImageSchema,
  primary: siteButtonSchema,
  secondary: siteButtonSchema,
});

const featuresSettings = z.strictObject({
  ...look,
  heading: text(140),
  intro: text(400),
  items: z
    .array(
      z.strictObject({
        /** One emoji or a short mark shown above the title. */
        mark: text(8),
        title: requiredText(100),
        text: text(400),
      }),
    )
    .max(12),
});

const coursesSettings = z.strictObject({
  ...look,
  heading: text(140),
  intro: text(400),
  /** "latest": the newest published courses; "picked": these, in order. */
  source: z.enum(["latest", "picked"]),
  courseIds: z.array(z.uuid()).max(12),
  limit: z.number().int().min(1).max(12),
  showPrice: z.boolean(),
});

const testimonialsSettings = z.strictObject({
  ...look,
  heading: text(140),
  /**
   * Shown only once the creator says these are real students' words
   * (India's rules on fake reviews), as on the course sales page.
   */
  confirmedReal: z.boolean(),
  items: z
    .array(
      z.strictObject({
        quote: requiredText(600),
        name: requiredText(80),
        detail: text(120),
      }),
    )
    .max(12),
});

const faqSettings = z.strictObject({
  ...look,
  heading: text(140),
  items: z
    .array(
      z.strictObject({
        question: requiredText(200),
        answer: requiredText(1500),
      }),
    )
    .max(30),
});

const ctaSettings = z.strictObject({
  ...look,
  heading: requiredText(140),
  text: text(400),
  button: siteButtonSchema,
});

const linksSettings = z.strictObject({
  ...look,
  name: text(80),
  bio: text(300),
  image: siteImageSchema,
  items: z.array(siteButtonSchema).max(20),
});

const footerSettings = z.strictObject({
  ...look,
  tagline: text(200),
  links: z.array(siteButtonSchema).max(12),
  /** Links to Terms, Privacy and Refunds. */
  showLegal: z.boolean(),
});

const headerSettings = z.strictObject({
  ...look,
  /** Shown beside the academy's name; the name itself comes from Platform. */
  links: z.array(siteButtonSchema).max(6),
  button: siteButtonSchema,
  /** Stays at the top of the screen while the visitor scrolls. */
  sticky: z.boolean(),
});

const logosSettings = z.strictObject({
  ...look,
  heading: text(140),
  items: z
    .array(
      z.strictObject({
        /** Shown as words when there is no picture. */
        name: requiredText(60),
        image: siteImageSchema,
      }),
    )
    .max(16),
});

const statsSettings = z.strictObject({
  ...look,
  heading: text(140),
  intro: text(400),
  items: z
    .array(
      z.strictObject({
        /** "12,000+", "4.9★", "98%": counts up when it starts with a number. */
        value: requiredText(16),
        label: requiredText(80),
      }),
    )
    .max(6),
});

const pricingSettings = z.strictObject({
  ...look,
  heading: text(140),
  intro: text(400),
  plans: z
    .array(
      z.strictObject({
        name: requiredText(60),
        price: requiredText(24),
        /** The struck-through price, when on offer. */
        compareAt: text(24),
        /** "one-time", "per month", "incl. GST". */
        period: text(40),
        /** One point per line. */
        features: text(1200),
        button: siteButtonSchema,
        /** Drawn bigger, with its badge. */
        highlight: z.boolean(),
        badge: text(30),
      }),
    )
    .max(4),
  /** Under the plans: "30-day refund", "EMI available". */
  note: text(200),
});

const aboutSettings = z.strictObject({
  ...look,
  eyebrow: text(80),
  heading: requiredText(140),
  text: text(1500),
  image: siteImageSchema,
  /** Short facts shown as chips: "10 years teaching", "IIT Delhi". */
  facts: z.array(z.strictObject({ text: requiredText(60) })).max(6),
  button: siteButtonSchema,
});

const countdownSettings = z.strictObject({
  ...look,
  heading: text(140),
  text: text(400),
  /**
   * "date": everyone counts down to `endsAt`; "evergreen": each visitor gets
   * `hours` from their first visit (kept in their browser).
   */
  mode: z.enum(["date", "evergreen"]),
  endsAt: z.union([z.literal(""), z.iso.datetime({ offset: true })]),
  hours: z.number().int().min(1).max(720),
  button: siteButtonSchema,
  /** Shown instead of the clock once it reaches zero. */
  endedText: text(200),
});

const guaranteeSettings = z.strictObject({
  ...look,
  /** The seal's words: "30-day money-back guarantee". */
  badge: requiredText(60),
  heading: text(140),
  text: text(600),
  items: z
    .array(
      z.strictObject({
        mark: text(8),
        text: requiredText(80),
      }),
    )
    .max(6),
});

const videoSettings = z.strictObject({
  ...look,
  heading: text(140),
  text: text(600),
  /** Where the video plays: YouTube, Vimeo, a free lesson. */
  url: z.union([z.literal(""), siteHrefSchema]),
  poster: siteImageSchema,
  button: siteButtonSchema,
});

const gallerySettings = z.strictObject({
  ...look,
  heading: text(140),
  items: z
    .array(
      z.strictObject({
        image: siteImageSchema,
        caption: text(140),
      }),
    )
    .max(24),
});

const textSettings = z.strictObject({
  ...look,
  heading: text(140),
  /** Paragraphs split by an empty line. */
  body: text(6000),
});

const buybarSettings = z.strictObject({
  ...look,
  /** What is for sale: "React from zero". */
  title: requiredText(80),
  price: text(24),
  compareAt: text(24),
  button: siteButtonSchema,
});

function section<Type extends SiteSectionType, Settings extends z.ZodType>(
  type: Type,
  settings: Settings,
) {
  return z.strictObject({
    ...sectionBase,
    type: z.literal(type),
    layout: z.enum(SITE_SECTION_LAYOUTS[type]),
    settings,
  });
}

export const siteSectionSchema = z.discriminatedUnion("type", [
  section("hero", heroSettings),
  section("features", featuresSettings),
  section("courses", coursesSettings),
  section("testimonials", testimonialsSettings),
  section("faq", faqSettings),
  section("cta", ctaSettings),
  section("links", linksSettings),
  section("footer", footerSettings),
  section("header", headerSettings),
  section("logos", logosSettings),
  section("stats", statsSettings),
  section("pricing", pricingSettings),
  section("about", aboutSettings),
  section("countdown", countdownSettings),
  section("guarantee", guaranteeSettings),
  section("video", videoSettings),
  section("gallery", gallerySettings),
  section("text", textSettings),
  section("buybar", buybarSettings),
]);
export type SiteSection = z.infer<typeof siteSectionSchema>;
export type SiteSectionOf<Type extends SiteSectionType> = Extract<
  SiteSection,
  { type: Type }
>;
export type SiteSectionSettings<Type extends SiteSectionType> =
  SiteSectionOf<Type>["settings"];

// --- The page -------------------------------------------------------------

export const sitePageSeoSchema = z.strictObject({
  title: text(70),
  description: text(170),
});

export const sitePageDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(SITE_PAGE_SCHEMA_VERSION),
    seo: sitePageSeoSchema,
    sections: z.array(siteSectionSchema).max(SITE_PAGE_MAX_SECTIONS),
  })
  .superRefine((document, context) => {
    const seen = new Set<string>();
    document.sections.forEach((entry, index) => {
      if (seen.has(entry.id)) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: "Each section needs its own id.",
        });
      }
      seen.add(entry.id);
    });
  });
export type SitePageDocument = z.infer<typeof sitePageDocumentSchema>;

export const SITE_PAGE_TYPES = [
  "home",
  "landing",
  "link_in_bio",
  "blank",
] as const;
export type SitePageType = (typeof SITE_PAGE_TYPES)[number];

/** Lowercase words joined by hyphens, as in `/diwali-offer`. */
export const sitePageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u,
    "Use lowercase letters, numbers and hyphens",
  );

// --- The site's look ------------------------------------------------------

export const SITE_COLOUR_MODES = ["system", "light", "dark"] as const;

/** How the whole site looks. Stored apart from every page's content. */
export const siteLookSchema = z.strictObject({
  themeId: z.enum(SITE_THEME_IDS),
  /** "system" follows the visitor's phone or computer setting. */
  colourMode: z.enum(SITE_COLOUR_MODES),
  /** Left out: the theme's own motion level. */
  motion: z.enum(SITE_MOTION_LEVELS).optional(),
});
export type SiteLook = z.infer<typeof siteLookSchema>;

export const DEFAULT_SITE_LOOK: SiteLook = {
  themeId: "coach",
  colourMode: "system",
};

// --- Data the renderer fills sections from --------------------------------

/** A course as a course card shows it, already formatted. */
export const siteCourseCardSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  imageUrl: z.string().nullable(),
  /** "Free", "₹4,999", or null when prices are hidden. */
  priceLabel: z.string().nullable(),
  /** The struck-through price, when on sale. */
  compareAtLabel: z.string().nullable(),
  lessons: z.number().int().nonnegative(),
});
export type SiteCourseCard = z.infer<typeof siteCourseCardSchema>;

// --- API ------------------------------------------------------------------

export const SITE_PAGE_STATUSES = ["draft", "published", "changed"] as const;

export const sitePageSummarySchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  type: z.enum(SITE_PAGE_TYPES),
  /**
   * draft: never published or taken down; published: live and the same as
   * the draft; changed: live, with unpublished edits in the draft.
   */
  status: z.enum(SITE_PAGE_STATUSES),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  /** Where visitors read the live page, relative to the API base. */
  livePath: z.string().nullable(),
});
export type SitePageSummary = z.infer<typeof sitePageSummarySchema>;

export const siteOverviewResponseSchema = z.strictObject({
  look: siteLookSchema,
  pages: z.array(sitePageSummarySchema),
});
export type SiteOverviewResponse = z.infer<typeof siteOverviewResponseSchema>;

export const createSitePageRequestSchema = z.strictObject({
  title: requiredText(120),
  slug: sitePageSlugSchema,
  type: z.enum(SITE_PAGE_TYPES),
});
export type CreateSitePageRequest = z.infer<typeof createSitePageRequestSchema>;

export const updateSitePageRequestSchema = z.strictObject({
  title: requiredText(120).optional(),
  slug: sitePageSlugSchema.optional(),
});
export type UpdateSitePageRequest = z.infer<typeof updateSitePageRequestSchema>;

export const saveSitePageDraftRequestSchema = z.strictObject({
  document: sitePageDocumentSchema,
  /**
   * The draft's `draftUpdatedAt` this edit started from. When another tab
   * saved since, the save is refused (409) instead of overwriting it.
   */
  baseUpdatedAt: z.iso.datetime().nullable(),
});
export type SaveSitePageDraftRequest = z.infer<
  typeof saveSitePageDraftRequestSchema
>;

export const sitePageVersionSchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int().positive(),
  publishedAt: z.iso.datetime(),
  isLive: z.boolean(),
});
export type SitePageVersion = z.infer<typeof sitePageVersionSchema>;

export const sitePageResponseSchema = z.strictObject({
  page: sitePageSummarySchema,
  document: sitePageDocumentSchema,
  draftUpdatedAt: z.iso.datetime(),
  versions: z.array(sitePageVersionSchema),
});
export type SitePageResponse = z.infer<typeof sitePageResponseSchema>;

export const siteCourseCardsResponseSchema = z.strictObject({
  courses: z.array(siteCourseCardSchema),
});
export type SiteCourseCardsResponse = z.infer<
  typeof siteCourseCardsResponseSchema
>;
