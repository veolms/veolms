import { z } from "zod";

/**
 * The course page's ready sections (creator-features/39-sales-page-sections-plan.md).
 *
 * The creator switches each on, puts them in order and fills them in, in
 * the course editor's "Sales page" step. All text is plain text: shown as
 * written, never as HTML or Markdown. Drafts may hold empty lines while the
 * creator types; the public page leaves those out, and a section with
 * nothing left in it is not shown.
 */

export const COURSE_PAGE_SECTION_KINDS = [
  "outcomes",
  "audience",
  "requirements",
  "instructor",
  "testimonials",
  "faq",
  "guarantee",
  "curriculum",
  "about",
] as const;
export type CoursePageSectionKind = (typeof COURSE_PAGE_SECTION_KINDS)[number];

/** The sections the course page already had: they can move, not hide. */
export const BUILT_IN_COURSE_PAGE_SECTIONS: readonly CoursePageSectionKind[] = [
  "curriculum",
  "about",
];

/** Where a course's sections go before the creator moves any. */
export const DEFAULT_COURSE_PAGE_ORDER: readonly CoursePageSectionKind[] = [
  "outcomes",
  "audience",
  "curriculum",
  "requirements",
  "instructor",
  "testimonials",
  "about",
  "faq",
  "guarantee",
];

export const COURSE_PAGE_LIMITS = {
  outcomes: 12,
  audience: 8,
  requirements: 8,
  testimonials: 12,
  faq: 20,
  pointLength: 160,
  headline: 120,
  bio: 1500,
  testimonialName: 80,
  testimonialDetail: 100,
  testimonialQuote: 600,
  question: 200,
  answer: 1500,
  guaranteeTitle: 80,
  guaranteeText: 600,
  seoTitle: 70,
  seoDescription: 160,
} as const;

const text = (max: number) => z.string().max(max);
const points = (count: number) =>
  z.array(text(COURSE_PAGE_LIMITS.pointLength)).max(count).default([]);
const itemId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/u);
const httpsImage = z
  .string()
  .max(2000)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Use an image address starting with https://" },
  );

export const coursePageContentSchemas = {
  outcomes: z.object({ items: points(COURSE_PAGE_LIMITS.outcomes) }),
  audience: z.object({
    forYou: points(COURSE_PAGE_LIMITS.audience),
    notForYou: points(COURSE_PAGE_LIMITS.audience),
  }),
  requirements: z.object({ items: points(COURSE_PAGE_LIMITS.requirements) }),
  instructor: z.object({
    headline: text(COURSE_PAGE_LIMITS.headline).default(""),
    /** Empty: the instructor's profile bio is shown. */
    bio: text(COURSE_PAGE_LIMITS.bio).default(""),
  }),
  testimonials: z.object({
    items: z
      .array(
        z.object({
          id: itemId,
          name: text(COURSE_PAGE_LIMITS.testimonialName),
          detail: text(COURSE_PAGE_LIMITS.testimonialDetail).default(""),
          quote: text(COURSE_PAGE_LIMITS.testimonialQuote),
          photoUrl: httpsImage.nullable().default(null),
        }),
      )
      .max(COURSE_PAGE_LIMITS.testimonials)
      .default([]),
    /**
     * The creator's word that these are real students' words: fake
     * testimonials are against Indian consumer rules. Unticked, the
     * section is not shown.
     */
    confirmedGenuine: z.boolean().default(false),
  }),
  faq: z.object({
    items: z
      .array(
        z.object({
          id: itemId,
          question: text(COURSE_PAGE_LIMITS.question),
          answer: text(COURSE_PAGE_LIMITS.answer),
        }),
      )
      .max(COURSE_PAGE_LIMITS.faq)
      .default([]),
  }),
  guarantee: z.object({
    title: text(COURSE_PAGE_LIMITS.guaranteeTitle).default(""),
    text: text(COURSE_PAGE_LIMITS.guaranteeText).default(""),
  }),
  curriculum: z.object({}),
  about: z.object({}),
} as const;

export type CoursePageContent<K extends CoursePageSectionKind> = z.infer<
  (typeof coursePageContentSchemas)[K]
>;

/** The search title and description, kept with the sections. */
export const courseSeoSchema = z.object({
  title: text(COURSE_PAGE_LIMITS.seoTitle).default(""),
  description: text(COURSE_PAGE_LIMITS.seoDescription).default(""),
});
export type CourseSeo = z.infer<typeof courseSeoSchema>;

/** One section as the editor holds it. */
export const coursePageSectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("outcomes"),
    isVisible: z.boolean(),
    content: coursePageContentSchemas.outcomes,
  }),
  z.object({
    kind: z.literal("audience"),
    isVisible: z.boolean(),
    content: coursePageContentSchemas.audience,
  }),
  z.object({
    kind: z.literal("requirements"),
    isVisible: z.boolean(),
    content: coursePageContentSchemas.requirements,
  }),
  z.object({
    kind: z.literal("instructor"),
    isVisible: z.boolean(),
    content: coursePageContentSchemas.instructor,
  }),
  z.object({
    kind: z.literal("testimonials"),
    isVisible: z.boolean(),
    content: coursePageContentSchemas.testimonials,
  }),
  z.object({
    kind: z.literal("faq"),
    isVisible: z.boolean(),
    content: coursePageContentSchemas.faq,
  }),
  z.object({
    kind: z.literal("guarantee"),
    isVisible: z.boolean(),
    content: coursePageContentSchemas.guarantee,
  }),
  z.object({
    kind: z.literal("curriculum"),
    isVisible: z.literal(true),
    content: coursePageContentSchemas.curriculum,
  }),
  z.object({
    kind: z.literal("about"),
    isVisible: z.literal(true),
    content: coursePageContentSchemas.about,
  }),
]);
export type CoursePageSection = z.infer<typeof coursePageSectionSchema>;

/** The editor's view: every section in page order, and the search fields. */
export const coursePageSectionsResponseSchema = z.object({
  sections: z.array(coursePageSectionSchema),
  seo: courseSeoSchema,
});
export type CoursePageSectionsResponse = z.infer<
  typeof coursePageSectionsResponseSchema
>;

/** Saving one section: its switch, its content, or both. */
export const updateCoursePageSectionRequestSchema = z.object({
  isVisible: z.boolean().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateCoursePageSectionRequest = z.infer<
  typeof updateCoursePageSectionRequestSchema
>;

export const reorderCoursePageSectionsRequestSchema = z.object({
  kinds: z
    .array(z.enum(COURSE_PAGE_SECTION_KINDS))
    .min(1)
    .max(COURSE_PAGE_SECTION_KINDS.length),
});
export type ReorderCoursePageSectionsRequest = z.infer<
  typeof reorderCoursePageSectionsRequestSchema
>;

// --- The public course page ---

/** The instructor as the page shows them; null when they hide their name. */
export const coursePageInstructorSchema = z.object({
  name: z.string(),
  headline: z.string(),
  bio: z.string(),
  avatarUrl: z.string().nullable(),
});

/**
 * What the course page shows: visible sections in order, each with only
 * the filled-in parts. The built-in ones mark where the curriculum and the
 * "about" text go.
 */
export const publicCoursePageSectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("outcomes"), items: z.array(z.string()) }),
  z.object({
    kind: z.literal("audience"),
    forYou: z.array(z.string()),
    notForYou: z.array(z.string()),
  }),
  z.object({ kind: z.literal("requirements"), items: z.array(z.string()) }),
  z.object({
    kind: z.literal("instructor"),
    instructor: coursePageInstructorSchema,
  }),
  z.object({
    kind: z.literal("testimonials"),
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        detail: z.string(),
        quote: z.string(),
        photoUrl: z.string().nullable(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("faq"),
    items: z.array(
      z.object({ id: z.string(), question: z.string(), answer: z.string() }),
    ),
  }),
  z.object({
    kind: z.literal("guarantee"),
    title: z.string(),
    text: z.string(),
  }),
  z.object({ kind: z.literal("curriculum") }),
  z.object({ kind: z.literal("about") }),
]);
export type PublicCoursePageSection = z.infer<
  typeof publicCoursePageSectionSchema
>;

export const publicCourseSalesPageSchema = z.object({
  sections: z.array(publicCoursePageSectionSchema),
  /** The search title and description, when the creator set them. */
  seo: z.object({
    title: z.string().nullable(),
    description: z.string().nullable(),
  }),
});
export type PublicCourseSalesPage = z.infer<typeof publicCourseSalesPageSchema>;

const filled = (lines: readonly string[]) =>
  lines.map((line) => line.trim()).filter(Boolean);

/**
 * A section as the public page shows it, or null when nothing in it is
 * ready (or, for testimonials, until the creator confirmed they are real).
 * The instructor section needs the instructor (null: hidden by the creator).
 */
export function presentCoursePageSection(
  section: CoursePageSection,
  instructor: z.infer<typeof coursePageInstructorSchema> | null,
): PublicCoursePageSection | null {
  if (!section.isVisible) return null;
  switch (section.kind) {
    case "outcomes":
    case "requirements": {
      const items = filled(section.content.items);
      return items.length ? { kind: section.kind, items } : null;
    }
    case "audience": {
      const forYou = filled(section.content.forYou);
      const notForYou = filled(section.content.notForYou);
      return forYou.length || notForYou.length
        ? { kind: "audience", forYou, notForYou }
        : null;
    }
    case "instructor": {
      if (!instructor) return null;
      const headline = section.content.headline.trim() || instructor.headline;
      const bio = section.content.bio.trim() || instructor.bio;
      return {
        kind: "instructor",
        instructor: { ...instructor, headline, bio },
      };
    }
    case "testimonials": {
      if (!section.content.confirmedGenuine) return null;
      const items = section.content.items
        .map((item) => ({
          id: item.id,
          name: item.name.trim(),
          detail: item.detail.trim(),
          quote: item.quote.trim(),
          photoUrl: item.photoUrl,
        }))
        .filter((item) => item.name && item.quote);
      return items.length ? { kind: "testimonials", items } : null;
    }
    case "faq": {
      const items = section.content.items
        .map((item) => ({
          id: item.id,
          question: item.question.trim(),
          answer: item.answer.trim(),
        }))
        .filter((item) => item.question && item.answer);
      return items.length ? { kind: "faq", items } : null;
    }
    case "guarantee": {
      const title = section.content.title.trim();
      const body = section.content.text.trim();
      return title || body ? { kind: "guarantee", title, text: body } : null;
    }
    case "curriculum":
    case "about":
      return { kind: section.kind };
  }
}
