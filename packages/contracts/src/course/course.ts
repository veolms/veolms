import { z } from "zod";
import { mediaAssetStatusSchema } from "../media.ts";

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
});

export const updateCoursePricingRequestSchema = z
  .object({
    /**
     * Ignored: a course is free exactly when it sells for zero, so the API
     * derives the type from the price. Accepted for older clients.
     */
    pricingType: pricingTypeSchema.optional(),
    price: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3).default("INR"),
    salePrice: z.number().int().nonnegative().nullable().optional(),
    /** Show the discount as a badge on the course's cards. Off by default. */
    showDiscountBadge: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (
        data.salePrice !== null &&
        data.salePrice !== undefined &&
        data.salePrice > data.price
      ) {
        return false;
      }
      return true;
    },
    {
      message: "salePrice cannot exceed price",
      path: ["salePrice"],
    },
  );

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

export const courseIncludeItemSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1).max(255),
  position: z.number().int().nonnegative(),
});

export const createCourseIncludeRequestSchema = z.object({
  text: z.string().min(1).max(255),
  icon: z.string().max(100).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const updateCourseIncludeRequestSchema = z.object({
  text: z.string().min(1).max(255).optional(),
  icon: z.string().max(100).nullable().optional(),
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
    .array(courseIncludeItemSchema.pick({ text: true, position: true }))
    .optional(),
  stats: z.object({
    totalSections: z.number().int().nonnegative(),
    totalLessons: z.number().int().nonnegative(),
    totalDurationSeconds: z.number().int().nonnegative(),
  }),
});

export type CourseOverviewResponse = z.infer<typeof courseOverviewSchema>;

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
