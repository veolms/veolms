import { z } from "zod";

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
}

export interface PublicCourse extends CourseSummary {
  description: string;
}

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
});

export const courseSummarySchema: z.ZodType<CourseSummary> =
  courseSummaryObjectSchema;

export const publicCourseSchema: z.ZodType<PublicCourse> =
  courseSummaryObjectSchema.extend({
    description: z
      .string()
      .min(1)
      .max(2000)
      .meta({ description: "Full course description." }),
  });

export const courseListResponseSchema = z.strictObject({
  courses: z
    .array(courseSummarySchema)
    .meta({ description: "Published courses, oldest first." }),
});

export const courseSlugSchema = z
  .string()
  .min(1)
  .max(160)
  .meta({ description: "URL-safe identifier used to address the course." });

export const courseSlugParamsSchema = z.object({ slug: courseSlugSchema });

export type CourseSlugParams = z.input<typeof courseSlugParamsSchema>;

// Name the shared contracts so the API documents them as reusable OpenAPI
// components instead of inlining a copy at every use site. Registering by
// reference keeps the schema identity these exports already share — `.meta()`
// returns a clone, which would leave the nested uses above pointing at an
// unnamed schema.
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

// --- Course Categories, Media, Curriculum & Authoring (moved from creator.ts) ---

// --- Categories ---
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

// --- Media Assets (re-exported from standalone media contracts) ---
export * from "./media.ts";

// --- Course Access Rules ---
export const accessTypeSchema = z.enum(["everyone", "restricted"]);
export const accessDurationTypeSchema = z.enum([
  "lifetime",
  "fixed_duration",
  "custom_expiration",
]);

export const courseAccessRuleSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  accessType: accessTypeSchema,
  durationType: accessDurationTypeSchema,
  durationDays: z.number().int().positive().nullable().optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const updateCourseAccessRuleRequestSchema = z
  .object({
    accessType: accessTypeSchema,
    durationType: accessDurationTypeSchema,
    durationDays: z.number().int().positive().nullable().optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
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
  )
  .refine(
    (data) => {
      if (data.durationType === "custom_expiration") {
        return Boolean(data.expiresAt);
      }
      return true;
    },
    {
      message: "expiresAt is required when durationType is custom_expiration",
      path: ["expiresAt"],
    },
  );

export type CourseAccessRule = z.infer<typeof courseAccessRuleSchema>;
export type UpdateCourseAccessRuleRequest = z.infer<
  typeof updateCourseAccessRuleRequestSchema
>;

// --- Course Pricing ---
export const pricingTypeSchema = z.enum(["free", "paid"]);

export const coursePricingSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  pricingType: pricingTypeSchema,
  price: z.number().int().nonnegative(), // in minor units (cents)
  currency: z.string().min(3).max(3),
  salePrice: z.number().int().nonnegative().nullable().optional(),
  saleStartsAt: z.iso.datetime().nullable().optional(),
  saleEndsAt: z.iso.datetime().nullable().optional(),
});

export const updateCoursePricingRequestSchema = z
  .object({
    pricingType: pricingTypeSchema,
    price: z.number().int().nonnegative(),
    currency: z.string().min(3).max(3).default("USD"),
    salePrice: z.number().int().nonnegative().nullable().optional(),
    saleStartsAt: z.iso.datetime().nullable().optional(),
    saleEndsAt: z.iso.datetime().nullable().optional(),
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
  )
  .refine(
    (data) => {
      if (data.saleStartsAt && data.saleEndsAt) {
        return new Date(data.saleEndsAt) >= new Date(data.saleStartsAt);
      }
      return true;
    },
    {
      message: "saleEndsAt cannot precede saleStartsAt",
      path: ["saleEndsAt"],
    },
  );

export type CoursePricing = z.infer<typeof coursePricingSchema>;
export type UpdateCoursePricingRequest = z.infer<
  typeof updateCoursePricingRequestSchema
>;

// --- Course Settings ---
export const courseSettingsSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  allowQa: z.boolean(),
  allowComments: z.boolean(),
  allowReviews: z.boolean(),
  allowDownloads: z.boolean(),
  certificateEnabled: z.boolean(),
  language: z.string(),
  estimatedDuration: z.number().int().positive().nullable().optional(),
});

export const updateCourseSettingsRequestSchema = z.object({
  allowQa: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  allowReviews: z.boolean().optional(),
  allowDownloads: z.boolean().optional(),
  certificateEnabled: z.boolean().optional(),
  language: z.string().optional(),
  estimatedDuration: z.number().int().positive().nullable().optional(),
});

export type CourseSettings = z.infer<typeof courseSettingsSchema>;
export type UpdateCourseSettingsRequest = z.infer<
  typeof updateCourseSettingsRequestSchema
>;

// --- Curriculum ---
export const createLessonResourceRequestSchema = z.object({
  mediaAssetId: z.uuid(),
  title: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
});

export const lessonResourceSchema = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  mediaAssetId: z.uuid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  position: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export const courseLessonSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  sectionId: z.uuid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  contentType: z.enum(["video", "document"]),
  contentMediaId: z.uuid().nullable().optional(),
  position: z.number().int().nonnegative(),
  isPreview: z.boolean(),
  isPublished: z.boolean(),
  resources: z.array(lessonResourceSchema).optional(),
});

export const courseSectionSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  position: z.number().int().nonnegative(),
  lessons: z.array(courseLessonSchema).optional(),
});

export const createCourseSectionRequestSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
});

export const updateCourseSectionRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
});

export const reorderSectionsRequestSchema = z.object({
  orderedSectionIds: z.array(z.uuid()),
  version: z.number().int().positive(),
});

export const createCourseLessonRequestSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1500).nullable().optional(),
  contentType: z.enum(["video", "document"]),
});

export const updateCourseLessonRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1500).nullable().optional(),
  contentType: z.enum(["video", "document"]).optional(),
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

// --- Course Authoring Operations ---
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
  status: z.enum(["draft", "published", "archived"]),
  creatorId: z.uuid().nullable(),
  categoryId: z.uuid().nullable().optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  trailerMediaId: z.uuid().nullable().optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable().optional(),
});

export const createCourseRequestSchema = z.object({
  title: z.string().min(1).max(120),
});

export const updateCourseBasicsRequestSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(1500).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .nullable()
    .optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  trailerMediaId: z.uuid().nullable().optional(),
  version: z.number().int(),
});

export const courseEditorDataResponseSchema = z.object({
  course: courseSchema,
  sections: z.array(courseSectionSchema),
  accessRules: courseAccessRuleSchema.nullable().optional(),
  pricing: coursePricingSchema.nullable().optional(),
  settings: courseSettingsSchema.nullable().optional(),
});

export const myCoursesListResponseSchema = z.object({
  courses: z.array(courseSchema),
});

export type Course = z.infer<typeof courseSchema>;
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;
export type UpdateCourseBasicsRequest = z.infer<
  typeof updateCourseBasicsRequestSchema
>;
export type CourseEditorDataResponse = z.infer<
  typeof courseEditorDataResponseSchema
>;
export type MyCoursesListResponse = z.infer<typeof myCoursesListResponseSchema>;

// --- Validation & Publishing ---
export const courseValidationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const courseValidationResponseSchema = z.object({
  canPublish: z.boolean(),
  errors: z.array(courseValidationIssueSchema),
  warnings: z.array(courseValidationIssueSchema),
});

export type CourseValidationIssue = z.infer<typeof courseValidationIssueSchema>;
export type CourseValidationResponse = z.infer<
  typeof courseValidationResponseSchema
>;

// --- Course Overview ---
export const courseOverviewSchema = z.object({
  course: courseSchema,
  category: categorySchema.nullable().optional(),
  creator: z
    .object({
      id: z.uuid(),
      displayName: z.string(),
      username: z.string(),
    })
    .nullable()
    .optional(),
  sections: z.array(courseSectionSchema),
  accessRules: courseAccessRuleSchema.nullable().optional(),
  pricing: coursePricingSchema.nullable().optional(),
  settings: courseSettingsSchema.nullable().optional(),
  stats: z.object({
    totalSections: z.number().int().nonnegative(),
    totalLessons: z.number().int().nonnegative(),
    totalDurationSeconds: z.number().int().nonnegative(),
  }),
});

export type CourseOverviewResponse = z.infer<typeof courseOverviewSchema>;

// --- Register schemas for OpenAPI documentation ---
z.globalRegistry.add(categorySchema, { id: "Category" });
z.globalRegistry.add(courseAccessRuleSchema, { id: "CourseAccessRule" });
z.globalRegistry.add(coursePricingSchema, { id: "CoursePricing" });
z.globalRegistry.add(courseSettingsSchema, { id: "CourseSettings" });
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
z.globalRegistry.add(courseOverviewSchema, {
  id: "CourseOverviewResponse",
});
z.globalRegistry.add(courseValidationResponseSchema, {
  id: "CourseValidationResponse",
});
