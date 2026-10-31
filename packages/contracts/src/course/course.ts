import { z } from "zod";
import { mediaAssetStatusSchema } from "../media.ts";
import {
  COURSE_INCLUDE_DETAIL_MAX,
  COURSE_INCLUDE_TEXT_MAX,
  courseIncludeColorSchema,
  courseIncludeIconSchema,
  courseIncludeKindSchema,
} from "./course-includes.ts";

export interface CoursePricingSummary {
  pricingType: "free" | "paid";
  price: number;
  currency: string;
  salePrice: number | null;
  /** Show the discount as a badge ("20% off") on the course's cards. */
  showDiscountBadge?: boolean;
}

/** One responsive rendition of a course thumbnail, as used in `srcset`. */
export interface CourseThumbnailVariant {
  url: string;
  width: number;
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  thumbnailUrl?: string | null;
  thumbnailSrcSet?: readonly CourseThumbnailVariant[];
  totalSections: number;
  totalLessons: number;
  totalDurationSeconds: number;
  pricing: CoursePricingSummary;
  certificateEnabled: boolean;
  /**
   * Whether someone may take this course for themselves: enrol in it when it
   * is free, or buy it when it is sold. False only for a course that is
   * access-restricted and has no price to pay, which is entered only by a
   * grant from staff, so a card must not offer enrolment in it. The same
   * value, by the same rule, as the course overview's `canSelfEnroll`: it
   * describes the course, not the viewer. Absent from a response built
   * before the field existed; read that as true.
   */
  canSelfEnroll?: boolean;
  /**
   * For a linked-only course, the published courses it comes free with
   * (see `courseOverviewSchema.includedWith`). Absent for any other course.
   */
  includedWith?: readonly IncludedWithCourse[];
}

/** A published course that gives a linked-only course to whoever holds it. */
export interface IncludedWithCourse {
  id: string;
  slug: string;
  title: string;
}

export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
}

export const coursePricingSummarySchema = z.strictObject({
  pricingType: z.enum(["free", "paid"]),
  price: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).default("INR"),
  salePrice: z.number().int().nonnegative().nullable().default(null),
  showDiscountBadge: z.boolean().default(false),
});

export const courseThumbnailVariantSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
});

const courseSummaryObjectSchema = z.strictObject({
  id: z.uuid().meta({ description: "Stable identifier of the course." }),
  slug: z
    .string()
    .min(1)
    .max(160)
    .meta({ description: "URL-safe identifier used to address the course." }),
  title: z.string().min(1).max(255).meta({ description: "Course title." }),
  shortDescription: z
    .string()
    .max(500)
    .default("")
    .meta({ description: "One-line summary shown in catalogue listings." }),
  thumbnailUrl: z.string().nullable().optional(),
  thumbnailSrcSet: z.array(courseThumbnailVariantSchema).optional(),
  totalSections: z.number().int().nonnegative().default(0),
  totalLessons: z.number().int().nonnegative().default(0),
  totalDurationSeconds: z.number().int().nonnegative().default(0),
  pricing: coursePricingSummarySchema,
  certificateEnabled: z.boolean().default(false),
  canSelfEnroll: z.boolean().optional(),
  includedWith: z
    .array(z.object({ id: z.uuid(), slug: z.string(), title: z.string() }))
    .optional(),
});

export const courseSummarySchema: z.ZodType<CourseSummary> =
  courseSummaryObjectSchema;

const publicCourseObjectSchema = z.strictObject({
  id: z.uuid().meta({ description: "Stable identifier of the course." }),
  slug: z
    .string()
    .min(1)
    .max(160)
    .meta({ description: "URL-safe identifier used to address the course." }),
  title: z.string().min(1).max(255).meta({ description: "Course title." }),
  shortDescription: z
    .string()
    .max(500)
    .default("")
    .meta({ description: "One-line summary shown in catalogue listings." }),
  // No minimum and a generous maximum on purpose: this is a RESPONSE
  // schema, and a course whose stored description was empty or longer than
  // the old 2000-character limit (the editors allow both) made this
  // endpoint fail serialization and return 500.
  description: z
    .string()
    .max(20_000)
    .meta({ description: "Full course description." }),
});

export const publicCourseSchema: z.ZodType<PublicCourse> =
  publicCourseObjectSchema;

/**
 * A title-sorted cursor carries the percent-encoded title of the last course
 * on the page. A title in a non-Latin script encodes to nine characters per
 * letter, so the previous limit of 256 failed response serialization.
 */
const COURSE_CURSOR_MAX_LENGTH = 2048;

export const courseListResponseSchema = z.strictObject({
  courses: z
    .array(courseSummarySchema)
    .meta({ description: "Published courses in stable catalogue order." }),
  nextCursor: z.string().min(1).max(COURSE_CURSOR_MAX_LENGTH).optional(),
});

export const courseOptionsResponseSchema = z.strictObject({
  courses: z.array(
    z.strictObject({
      id: z.uuid(),
      title: z.string().min(1).max(255),
    }),
  ),
});

export const courseListQuerySchema = z.object({
  creatorId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  cursor: z.string().min(1).max(COURSE_CURSOR_MAX_LENGTH).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(["latest", "title"]).optional(),
});

export type CourseListResponse = z.infer<typeof courseListResponseSchema>;
export type CourseOptionsResponse = z.infer<typeof courseOptionsResponseSchema>;
export type CourseListQuery = z.infer<typeof courseListQuerySchema>;

export const courseSlugSchema = z
  .string()
  .min(1)
  .max(160)
  .meta({ description: "URL-safe identifier used to address the course." });

export const courseSlugParamsSchema = z.object({ slug: courseSlugSchema });
export type CourseSlugParams = z.input<typeof courseSlugParamsSchema>;

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(120),
});

export const createCategoryRequestSchema = z.object({
  name: z.string().min(1).max(100),
});

export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const accessTypeSchema = z.enum(["everyone", "restricted"]);
export const accessDurationTypeSchema = z.enum([
  "lifetime",
  "fixed_duration",
  "custom_expiration",
]);

export const courseAccessRuleSchema = z.object({
  id: z.uuid(),
  accessType: accessTypeSchema,
  durationType: accessDurationTypeSchema,
  durationDays: z.number().int().positive().nullable().optional(),
});

export const updateCourseAccessRuleRequestSchema = z
  .object({
    accessType: accessTypeSchema,
    durationType: accessDurationTypeSchema,
    durationDays: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.durationType === "fixed_duration") {
        return (
          data.durationDays !== null &&
          data.durationDays !== undefined &&
          data.durationDays > 0
        );
      }
      return true;
    },
    {
      message: "durationDays is required when durationType is fixed_duration",
      path: ["durationDays"],
    },
  );

export type CourseAccessRule = z.infer<typeof courseAccessRuleSchema>;
export type UpdateCourseAccessRuleRequest = z.infer<
  typeof updateCourseAccessRuleRequestSchema
>;

export const pricingTypeSchema = z.enum(["free", "paid"]);

export const coursePricingSchema = z.object({
  id: z.uuid(),
  pricingType: pricingTypeSchema,
  price: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).default("INR"),
  salePrice: z.number().int().nonnegative().nullable().optional(),
  showDiscountBadge: z.boolean().optional(),
  /**
   * Had only through another course's link: no price, not sold, and left
   * out of the catalogue.
   */
  linkedOnly: z.boolean().optional(),
});

/**
 * A course's price is always both numbers: `salePrice`, what a learner
 * pays (zero makes the course free), and `price`, the marked price it is
 * struck through from, never below it. No discount is the two being equal.
 * The database refuses any other shape (see the migration that added
 * `course_pricing_sale_price_rules`).
 */
export const updateCoursePricingRequestSchema = z
  .object({
    /**
     * Ignored: a course is free exactly when it sells for zero, so the API
     * derives the type from the price. Accepted for older clients.
     */
    pricingType: pricingTypeSchema.optional(),
    /** The marked price, struck through when above `salePrice`. */
    price: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3).default("INR"),
    /** What a learner pays. */
    salePrice: z.number().int().nonnegative(),
    /** Show the discount as a badge on the course's cards. Off by default. */
    showDiscountBadge: z.boolean().optional(),
    /**
     * Had only through another course's link. When on, both prices are
     * stored as zero whatever was sent, and the course's access becomes
     * restricted; turning it off makes access open to everyone again.
     */
    linkedOnly: z.boolean().optional(),
  })
  .refine((data) => data.salePrice <= data.price, {
    message: "salePrice cannot exceed price",
    path: ["salePrice"],
  });

export type CoursePricing = z.infer<typeof coursePricingSchema>;
export type UpdateCoursePricingRequest = z.infer<
  typeof updateCoursePricingRequestSchema
>;

export const courseSettingsSchema = z.object({
  id: z.uuid(),
  allowQa: z.boolean(),
  allowComments: z.boolean(),
  allowDownloads: z.boolean(),
  allowNotes: z.boolean(),
  certificateEnabled: z.boolean(),
  showInstructorName: z.boolean().default(true),
  language: z.string(),
  estimatedDuration: z.number().int().positive().nullable().optional(),
});

export const updateCourseSettingsRequestSchema = z.object({
  allowQa: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  allowDownloads: z.boolean().optional(),
  allowNotes: z.boolean().optional(),
  certificateEnabled: z.boolean().optional(),
  showInstructorName: z.boolean().optional(),
  language: z.string().optional(),
  estimatedDuration: z.number().int().positive().nullable().optional(),
});

export type CourseSettings = z.infer<typeof courseSettingsSchema>;
export type UpdateCourseSettingsRequest = z.infer<
  typeof updateCourseSettingsRequestSchema
>;

/**
 * One line of a course's "This course includes" card (see
 * course-includes.ts): its title (`text`), a quieter line under it, an icon
 * and its colour. A line saved before icons and colours existed has none;
 * the card then draws a check mark in teal.
 */
export const courseIncludeItemSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1).max(255),
  position: z.number().int().nonnegative(),
  detail: z.string().max(255).nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  kind: courseIncludeKindSchema.optional(),
});

export const createCourseIncludeRequestSchema = z.object({
  text: z.string().trim().min(1).max(COURSE_INCLUDE_TEXT_MAX),
  detail: z
    .string()
    .trim()
    .max(COURSE_INCLUDE_DETAIL_MAX)
    .nullable()
    .optional(),
  icon: courseIncludeIconSchema.nullable().optional(),
  color: courseIncludeColorSchema.nullable().optional(),
  kind: courseIncludeKindSchema.optional(),
  position: z.number().int().nonnegative().optional(),
});

export const updateCourseIncludeRequestSchema = z.object({
  text: z.string().trim().min(1).max(COURSE_INCLUDE_TEXT_MAX).optional(),
  detail: z
    .string()
    .trim()
    .max(COURSE_INCLUDE_DETAIL_MAX)
    .nullable()
    .optional(),
  icon: courseIncludeIconSchema.nullable().optional(),
  color: courseIncludeColorSchema.nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const reorderCourseIncludesRequestSchema = z.object({
  orderedIds: z.array(z.uuid()),
});

export const courseIncludesListResponseSchema = z.object({
  items: z.array(courseIncludeItemSchema),
});

export type CourseIncludeItem = z.infer<typeof courseIncludeItemSchema>;
export type CreateCourseIncludeRequest = z.infer<
  typeof createCourseIncludeRequestSchema
>;
export type UpdateCourseIncludeRequest = z.infer<
  typeof updateCourseIncludeRequestSchema
>;
export type ReorderCourseIncludesRequest = z.infer<
  typeof reorderCourseIncludesRequestSchema
>;
export type CourseIncludesListResponse = z.infer<
  typeof courseIncludesListResponseSchema
>;

/** A course that comes free with the course it is linked to. */
export const linkedCourseItemSchema = z.object({
  courseId: z.uuid(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
});

export const linkedCoursesListResponseSchema = z.object({
  items: z.array(linkedCourseItemSchema),
});

export const addLinkedCourseRequestSchema = z.strictObject({
  linkedCourseId: z.uuid(),
});

export type LinkedCourseItem = z.infer<typeof linkedCourseItemSchema>;
export type LinkedCoursesListResponse = z.infer<
  typeof linkedCoursesListResponseSchema
>;
export type AddLinkedCourseRequest = z.infer<
  typeof addLinkedCourseRequestSchema
>;

/**
 * Part of a course, sold on its own: an unlisted course that opens only the
 * chosen sections of the course it belongs to, to whoever buys it or is
 * given it. It is kept off every list (the catalogue, the admin's course
 * list, My Courses); its learners see the course it belongs to, with the
 * other sections locked. Its orders and invoices name it. Prices are in
 * major units, as course pricing is.
 */
export const partialAccessCourseSchema = z.object({
  courseId: z.uuid(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  /**
   * What the whole course sells for now: the part's price is shown against
   * it, struck through, with the difference as its discount.
   */
  price: z.number().nonnegative(),
  /** What a learner pays for the part. */
  salePrice: z.number().nonnegative(),
  currency: z.string(),
  /** The sections of the course it opens, in the course's order. */
  sectionIds: z.array(z.uuid()),
  /** Sold from its link (its page is `offerPath`); a draft is not. */
  onSale: z.boolean(),
  /**
   * Where it is sold: the course's page, showing which sections it opens.
   * Relative to the site.
   */
  offerPath: z.string(),
  /** Learners who hold it now. */
  learnerCount: z.number().int().nonnegative(),
  /** Orders that name it, of any status: it is kept while any exist. */
  orderCount: z.number().int().nonnegative(),
});

export const partialAccessListResponseSchema = z.object({
  items: z.array(partialAccessCourseSchema),
  /** What the whole course sells for now. */
  coursePrice: z.number().nonnegative(),
  /** The course's sections, in order, to choose from. */
  sections: z.array(z.object({ id: z.uuid(), title: z.string() })),
});

/**
 * Only the part's own selling price is set: what it is shown against is
 * the whole course's price.
 */
export const createPartialAccessRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  salePrice: z.number().int().nonnegative(),
  /** At least one section of the course. */
  sectionIds: z.array(z.uuid()).min(1),
  /** Sell it from its link straight away. */
  onSale: z.boolean().optional(),
});

/** The same fields; what is left out stays as it is. */
export const updatePartialAccessRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  salePrice: z.number().int().nonnegative().optional(),
  sectionIds: z.array(z.uuid()).min(1).optional(),
  onSale: z.boolean().optional(),
});

/**
 * `GET /course-offers/:idOrSlug/:offerSlug`: a part of a course as its
 * link's page shows it to anyone. `courseId` is what checkout sells.
 */
export const partialAccessOfferSchema = z.object({
  courseId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  /** What the whole course sells for now, struck through beside `salePrice`. */
  price: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  currency: z.string(),
  /** The sections of the course it opens; the others stay locked. */
  sectionIds: z.array(z.uuid()),
  /** Whether it can be bought now. */
  onSale: z.boolean(),
});

export type PartialAccessOffer = z.infer<typeof partialAccessOfferSchema>;

/** `GET /course-offers`: every partial access, for choosing in a coupon. */
export const partialAccessOptionsResponseSchema = z.object({
  items: z.array(
    z.object({
      /** The partial access (an unlisted course): what a coupon names. */
      courseId: z.uuid(),
      title: z.string(),
      /** The course it opens part of. */
      courseTitle: z.string(),
    }),
  ),
});
export type PartialAccessOptionsResponse = z.infer<
  typeof partialAccessOptionsResponseSchema
>;
export type PartialAccessCourse = z.infer<typeof partialAccessCourseSchema>;
export type PartialAccessListResponse = z.infer<
  typeof partialAccessListResponseSchema
>;
export type CreatePartialAccessRequest = z.infer<
  typeof createPartialAccessRequestSchema
>;
export type UpdatePartialAccessRequest = z.infer<
  typeof updatePartialAccessRequestSchema
>;

export const createLessonResourceRequestSchema = z.object({
  mediaAssetId: z.uuid(),
  title: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
});

export const lessonResourceSchema = z.object({
  id: z.uuid(),
  mediaAssetId: z.uuid(),
  title: z.string().min(1),
  mediaAsset: z
    .object({
      originalFilename: z.string(),
      mimeType: z.string(),
      sizeBytes: z.coerce.number().int().nonnegative(),
      status: mediaAssetStatusSchema,
    })
    .optional(),
});

export const courseLessonSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  contentType: z.enum(["video", "document", "quiz"]),
  contentMediaId: z.uuid().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  position: z.number().int().nonnegative(),
  isPreview: z.boolean(),
  isPublished: z.boolean(),
  resources: z.array(lessonResourceSchema).optional(),
});

export const courseSectionSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
  lessons: z.array(courseLessonSchema).optional(),
});

export const createCourseSectionRequestSchema = z.object({
  title: z.string().min(1).max(255),
});

export const updateCourseSectionRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

export const reorderSectionsRequestSchema = z.object({
  orderedSectionIds: z.array(z.uuid()),
  version: z.number().int().positive(),
});

export const createCourseLessonRequestSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  contentType: z.enum(["video", "document", "quiz"]),
});

export const updateCourseLessonRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).nullable().optional(),
  contentType: z.enum(["video", "document", "quiz"]).optional(),
  contentMediaId: z.uuid().nullable().optional(),
  isPreview: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

export const reorderLessonsRequestSchema = z.object({
  orderedLessonIds: z.array(z.uuid()),
  version: z.number().int().positive(),
});

export type CreateLessonResourceRequest = z.infer<
  typeof createLessonResourceRequestSchema
>;
export type CourseSection = z.infer<typeof courseSectionSchema>;
export type CreateCourseSectionRequest = z.infer<
  typeof createCourseSectionRequestSchema
>;
export type UpdateCourseSectionRequest = z.infer<
  typeof updateCourseSectionRequestSchema
>;
export type ReorderSectionsRequest = z.infer<
  typeof reorderSectionsRequestSchema
>;
export type CourseLesson = z.infer<typeof courseLessonSchema>;
export type CreateCourseLessonRequest = z.infer<
  typeof createCourseLessonRequestSchema
>;
export type UpdateCourseLessonRequest = z.infer<
  typeof updateCourseLessonRequestSchema
>;
export type ReorderLessonsRequest = z.infer<typeof reorderLessonsRequestSchema>;
export type LessonResource = z.infer<typeof lessonResourceSchema>;

export const courseStatusSchema = z.enum(["draft", "published", "archived"]);

export const courseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  shortDescription: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .nullable()
    .optional(),
  status: courseStatusSchema,
  creatorId: z.uuid().nullable(),
  categoryId: z.uuid().nullable().optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  thumbnailSrcSet: z
    .array(
      z.object({
        url: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .optional(),
  trailerMediaId: z.uuid().nullable().optional(),
  bannerMediaId: z.uuid().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  bannerSrcSet: z.array(courseThumbnailVariantSchema).optional(),
  instructorAlias: z.string().max(120).nullable().optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable().optional(),
  totalSections: z.number().int().nonnegative().optional(),
  totalLessons: z.number().int().nonnegative().optional(),
  totalDurationSeconds: z.number().int().nonnegative().optional(),
});

const courseDifficultySchema = z
  .enum(["beginner", "intermediate", "advanced"])
  .nullable()
  .optional();

/** What `POST /courses` returns: the new draft's identity and editor seed. */
export const courseCreatedResponseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  instructorAlias: z.string().max(120).nullable().optional(),
  version: z.number().int(),
});

/** What `PATCH /courses/:id/basics` returns: the saved basics, as stored. */
export const courseBasicsResponseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  shortDescription: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  difficulty: courseDifficultySchema,
  categoryId: z.uuid().nullable().optional(),
  instructorAlias: z.string().max(120).nullable().optional(),
  version: z.number().int(),
});

/** Returned instead of the basics when a new trailer still has to be processed. */
export const courseBasicsAcceptedResponseSchema = z.object({
  version: z.number().int(),
});

/** What publishing and unpublishing return. */
export const courseStatusResponseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: courseStatusSchema,
  version: z.number().int(),
});

/** A course as it appears in the authoring/management list. */
export const managedCourseSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  shortDescription: z.string().nullable().optional(),
  difficulty: courseDifficultySchema,
  status: courseStatusSchema,
  creatorId: z.uuid().nullable(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  thumbnailSrcSet: z.array(courseThumbnailVariantSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  totalSections: z.number().int().nonnegative(),
  totalLessons: z.number().int().nonnegative(),
  totalDurationSeconds: z.number().int().nonnegative(),
});

export const createCourseRequestSchema = z.object({
  title: z.string().min(1).max(120),
  shortDescription: z.string().max(500).nullable().optional(),
  description: z.string().max(1500).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .nullable()
    .optional(),
  difficultyLevel: z
    .enum(["beginner", "intermediate", "advanced"])
    .nullable()
    .optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  trailerMediaId: z.uuid().nullable().optional(),
  instructorAlias: z.string().max(120).nullable().optional(),
});

export const updateCourseBasicsRequestSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  shortDescription: z.string().max(500).nullable().optional(),
  description: z.string().max(1500).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  category: z.uuid().nullable().optional(),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .nullable()
    .optional(),
  difficultyLevel: z
    .enum(["beginner", "intermediate", "advanced"])
    .nullable()
    .optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  trailerMediaId: z.uuid().nullable().optional(),
  // The desktop overview banner; null removes it.
  bannerMediaId: z.uuid().nullable().optional(),
  instructorAlias: z.string().max(120).nullable().optional(),
  version: z.number().int(),
});

export const courseEditorDataResponseSchema = z.object({
  course: courseSchema,
  sections: z.array(courseSectionSchema),
  accessRules: courseAccessRuleSchema.nullable().optional(),
  pricing: coursePricingSchema.nullable().optional(),
  settings: courseSettingsSchema.nullable().optional(),
  includes: z.array(courseIncludeItemSchema).optional(),
});

export const myCoursesListResponseSchema = z.object({
  courses: z.array(managedCourseSummarySchema),
});

/** Published courses of one creator, as `GET /courses/creator/:creatorId` returns them. */
export const creatorCoursesListResponseSchema = z.object({
  courses: z.array(courseSchema),
});

/**
 * `slug` is what the public page refresh uses to remove the deleted course's
 * static page: the course can no longer be looked up once it is in the bin.
 */
export const courseDeleteResponseSchema = z.object({
  slug: z.string().optional(),
});

/** Refresh state as the refresh service tracks it. */
export const courseStaticPageRefreshStatusSchema = z.object({
  courseId: z.uuid(),
  status: z.enum(["idle", "queued", "running", "succeeded", "failed"]),
  message: z.string().nullable(),
  updatedAt: z.string(),
  requestId: z.string().nullable(),
  runUrl: z.string().url().nullable(),
});
export type CourseStaticPageRefreshStatus = z.infer<
  typeof courseStaticPageRefreshStatusSchema
>;

/** The part of the refresh state the course editor is shown. */
export const courseStaticPageRefreshStatusResponseSchema =
  courseStaticPageRefreshStatusSchema.pick({
    status: true,
    message: true,
    runUrl: true,
  });
export type CourseStaticPageRefreshStatusResponse = z.infer<
  typeof courseStaticPageRefreshStatusResponseSchema
>;

export const deletedCourseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  status: courseStatusSchema,
  creatorId: z.uuid().nullable(),
  deletedAt: z.string(),
});

export const deletedCoursesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
});

export const deletedCoursesListResponseSchema = z.object({
  courses: z.array(deletedCourseSchema),
  nextCursor: z.string().nullable(),
});

/**
 * `course.slug` is what the public page refresh uses to rebuild the restored
 * course's static page.
 */
export const restoreCourseResponseSchema = z.object({
  course: z.object({
    id: z.uuid(),
    slug: z.string(),
  }),
});

export type Course = z.infer<typeof courseSchema>;
export type CourseCreatedResponse = z.infer<typeof courseCreatedResponseSchema>;
export type CourseBasicsResponse = z.infer<typeof courseBasicsResponseSchema>;
export type CourseStatusResponse = z.infer<typeof courseStatusResponseSchema>;
export type ManagedCourseSummary = z.infer<typeof managedCourseSummarySchema>;
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;
export type UpdateCourseBasicsRequest = z.infer<
  typeof updateCourseBasicsRequestSchema
>;
export type CourseEditorDataResponse = z.infer<
  typeof courseEditorDataResponseSchema
>;
export type MyCoursesListResponse = z.infer<typeof myCoursesListResponseSchema>;
export type CourseDeleteResponse = z.infer<typeof courseDeleteResponseSchema>;
export type DeletedCourse = z.infer<typeof deletedCourseSchema>;
export type DeletedCoursesQuery = z.infer<typeof deletedCoursesQuerySchema>;
export type DeletedCoursesListResponse = z.infer<
  typeof deletedCoursesListResponseSchema
>;
export type RestoreCourseResponse = z.infer<typeof restoreCourseResponseSchema>;

// --- Validation & Publishing ---
export const courseValidationAreaSchema = z.enum([
  "basics",
  "curriculum",
  "accessRules",
  "pricing",
  "extras",
]);

export const courseValidationIssueSchema = z.object({
  message: z.string(),
});

export const validationItemSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
});

export const courseValidationSectionsSchema = z.object({
  basics: validationItemSchema,
  curriculum: validationItemSchema,
  accessRules: validationItemSchema,
  pricing: validationItemSchema,
  extras: validationItemSchema,
});

export const courseValidationResponseSchema = z.object({
  canPublish: z.boolean(),
  sections: courseValidationSectionsSchema,
  errors: z.array(courseValidationIssueSchema),
});

export type CourseValidationArea = z.infer<typeof courseValidationAreaSchema>;
export type CourseValidationIssue = z.infer<typeof courseValidationIssueSchema>;
export type ValidationItem = z.infer<typeof validationItemSchema>;
export type CourseValidationSections = z.infer<
  typeof courseValidationSectionsSchema
>;
export type CourseValidationResponse = z.infer<
  typeof courseValidationResponseSchema
>;

/**
 * The learner-facing view of a course. It is public for published courses,
 * so every key here is one a learner screen reads; authoring-only data
 * (version, timestamps, media ids, access rules) stays on the editor payload.
 */
export const courseOverviewCourseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  shortDescription: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  difficulty: courseDifficultySchema,
  status: courseStatusSchema,
  creatorId: z.uuid().nullable(),
  thumbnailUrl: z.string().nullable().optional(),
  thumbnailSrcSet: z.array(courseThumbnailVariantSchema).optional(),
  // The wide picture behind the hero on desktop; the thumbnail elsewhere.
  bannerUrl: z.string().nullable().optional(),
  bannerSrcSet: z.array(courseThumbnailVariantSchema).optional(),
  trailerMediaId: z.uuid().nullable().optional(),
  // Null when the instructor is hidden from learners.
  instructorAlias: z.string().max(120).nullable().optional(),
});

export const courseOverviewSchema = z.object({
  course: courseOverviewCourseSchema,
  category: z
    .object({ name: z.string().min(1).max(100) })
    .nullable()
    .optional(),
  // Null when the instructor is hidden from learners.
  creator: z
    .object({
      id: z.uuid(),
      displayName: z.string(),
    })
    .nullable()
    .optional(),
  sections: z.array(courseSectionSchema),
  pricing: coursePricingSchema
    .pick({
      pricingType: true,
      price: true,
      currency: true,
      salePrice: true,
      showDiscountBadge: true,
    })
    .nullable()
    .optional(),
  settings: courseSettingsSchema
    .pick({
      allowQa: true,
      allowComments: true,
      allowNotes: true,
      showInstructorName: true,
      language: true,
      estimatedDuration: true,
    })
    .nullable()
    .optional(),
  includes: z
    .array(
      courseIncludeItemSchema.pick({
        text: true,
        position: true,
        detail: true,
        icon: true,
        color: true,
        kind: true,
      }),
    )
    .optional(),
  /**
   * Whether someone may take this course for themselves: enrol in it when it
   * is free, or buy it when it is sold. False only for a course that is
   * access-restricted and has no price to pay. Checkout refuses such a
   * course (`COURSE_ACCESS_RESTRICTED`) and it is entered only by a grant
   * from staff, so a client must not offer enrolment in it. A restricted
   * course that is sold is true: buying it is how it is entered.
   *
   * It describes the course, not the viewer: it is the same for a visitor, a
   * learner and the course's creator, and someone who already holds the
   * course keeps their access whatever it says. Absent from a response
   * built before the field existed; read that as true.
   */
  canSelfEnroll: z.boolean().optional(),
  /**
   * For a linked-only course, the published courses that include it: it is
   * not sold or enrolled in on its own, and whoever holds one of these
   * holds it too. Present only for a linked-only course (possibly empty
   * when nothing published links it yet). Like `canSelfEnroll` it describes
   * the course, not the viewer.
   */
  includedWith: z
    .array(
      z.object({
        id: z.uuid(),
        slug: z.string(),
        title: z.string(),
      }),
    )
    .optional(),
  /**
   * The published courses that come free with this one (its linked
   * courses), in the order they were linked, as the course list shows
   * them. Absent when there are none. Like `canSelfEnroll` it describes the
   * course, not the viewer.
   */
  includedCourses: z
    .array(
      courseSummaryObjectSchema
        .pick({
          id: true,
          slug: true,
          title: true,
          thumbnailUrl: true,
          thumbnailSrcSet: true,
        })
        .extend({
          /**
           * What the course sells for on its own, for a course that is also
           * sold separately. Null for a linked-only course and a free one.
           */
          worth: z
            .object({
              amount: z.number().int().positive(),
              currency: z.string(),
            })
            .nullable(),
        }),
    )
    .optional(),
  /**
   * How long a learner keeps the course once they have it: for life, for a
   * number of days from enrolling, or until a date set for each learner.
   * Like `canSelfEnroll` it describes the course, not the viewer (see
   * `courseAccessResponseSchema.accessExpiresAt` for a learner's own end
   * date). Null for a course with no access rule; absent from a response
   * built before the field existed.
   */
  accessValidity: z
    .object({
      durationType: accessDurationTypeSchema,
      durationDays: z.number().int().positive().nullable(),
    })
    .nullable()
    .optional(),
  stats: z.object({
    totalSections: z.number().int().nonnegative(),
    totalLessons: z.number().int().nonnegative(),
    totalDurationSeconds: z.number().int().nonnegative(),
  }),
});

export type CourseOverviewResponse = z.infer<typeof courseOverviewSchema>;

/**
 * One lesson's description, for the lesson page. Shown to exactly the viewers
 * the course overview lists the lesson for.
 */
export const lessonDescriptionParamsSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.uuid(),
});

export const lessonDescriptionResponseSchema = z.object({
  lessonId: z.uuid(),
  description: z.string().nullable(),
});

export type LessonDescriptionParams = z.infer<
  typeof lessonDescriptionParamsSchema
>;
export type LessonDescriptionResponse = z.infer<
  typeof lessonDescriptionResponseSchema
>;

z.globalRegistry.add(courseSummarySchema, {
  id: "CourseSummary",
  description: "A course as it appears in catalogue listings.",
});
z.globalRegistry.add(publicCourseSchema, {
  id: "PublicCourse",
  description: "A published course, including its full description.",
});
z.globalRegistry.add(courseListResponseSchema, {
  id: "CourseListResponse",
  description: "The published course catalogue.",
});
z.globalRegistry.add(categorySchema, { id: "Category" });
z.globalRegistry.add(courseAccessRuleSchema, { id: "CourseAccessRule" });
z.globalRegistry.add(coursePricingSchema, { id: "CoursePricing" });
z.globalRegistry.add(courseSettingsSchema, { id: "CourseSettings" });
z.globalRegistry.add(courseIncludeItemSchema, { id: "CourseIncludeItem" });
z.globalRegistry.add(courseIncludesListResponseSchema, {
  id: "CourseIncludesListResponse",
});
z.globalRegistry.add(createLessonResourceRequestSchema, {
  id: "CreateLessonResourceRequest",
});
z.globalRegistry.add(courseLessonSchema, { id: "CourseLesson" });
z.globalRegistry.add(lessonDescriptionResponseSchema, {
  id: "LessonDescriptionResponse",
});
z.globalRegistry.add(courseSectionSchema, { id: "CourseSection" });
z.globalRegistry.add(courseSchema, { id: "Course" });
z.globalRegistry.add(courseEditorDataResponseSchema, {
  id: "CourseEditorDataResponse",
});
z.globalRegistry.add(myCoursesListResponseSchema, {
  id: "MyCoursesListResponse",
});
z.globalRegistry.add(courseDeleteResponseSchema, {
  id: "CourseDeleteResponse",
});
z.globalRegistry.add(courseStaticPageRefreshStatusSchema, {
  id: "CourseStaticPageRefreshStatus",
});
z.globalRegistry.add(deletedCourseSchema, { id: "DeletedCourse" });
z.globalRegistry.add(deletedCoursesListResponseSchema, {
  id: "DeletedCoursesListResponse",
});
z.globalRegistry.add(restoreCourseResponseSchema, {
  id: "RestoreCourseResponse",
});
z.globalRegistry.add(courseOverviewSchema, {
  id: "CourseOverviewResponse",
});
z.globalRegistry.add(validationItemSchema, {
  id: "ValidationItem",
});
z.globalRegistry.add(courseValidationSectionsSchema, {
  id: "CourseValidationSections",
});
z.globalRegistry.add(courseValidationResponseSchema, {
  id: "CourseValidationResponse",
});
