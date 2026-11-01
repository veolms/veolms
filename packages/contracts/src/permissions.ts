import { z } from "zod";

/**
 * VeoLMS Permission Catalogue.
 * Immutable list of all fine-grained capability keys across the platform.
 */
export const permissions = [
  // Role & User Management permissions
  "role.read",
  "role.create",
  "role.update",
  "role.delete",
  "role.assign",

  // Course permissions
  "course.read",
  "course.preview",
  "course.create",
  "course.details.update",
  "course.thumbnail.update",
  "course.pricing.update",
  "course.curriculum.update",
  "course.publish",
  "course.unpublish",
  "course.archive",
  "course.delete",

  // Lesson permissions
  "lesson.read",
  "lesson.create",
  "lesson.details.update",
  "lesson.content.update",
  "lesson.video.update",
  "lesson.thumbnail.update",
  "lesson.reorder",
  "lesson.publish",
  "lesson.delete",

  // Quiz and assignment permissions
  "quiz.read",
  "quiz.create",
  "quiz.settings.update",
  "quiz.questions.manage",
  "quiz.publish",
  "quiz.delete",
  "assignment.read",
  "assignment.create",
  "assignment.update",
  "assignment.publish",
  "assignment.delete",
  "submission.read",
  "submission.grade",
  "submission.grade.override",

  // LMS Domain & Platform permissions
  "enrollment.read",
  "enrollment.create",
  "enrollment.cancel",
  "discussion.read",
  "discussion.moderate",
  "analytics.course.read",
  "analytics.revenue.read",
  "certificate.issue",
  "certificate.revoke",
  "billing.read",
  "billing.manage",

  // Keys below were added after the first seed. The seed derives each
  // permission row id from its position in this list, so new keys are only
  // ever appended.

  // Team management
  "team.read",
  "team.invite",
  "team.update",
  "team.remove",

  // Students
  "student.read",
  "student.contact.update",
  "student.access.manage",

  // Coupons
  "coupon.read",
  "coupon.manage",
  "coupon.delete",

  // Commerce
  "refund.review",
  "payment.manual.verify",
  "payment.gateway.manage",
  "bundle.manage",

  // Catalogue
  "category.manage",
  "course.restore",

  // Platform
  "platform.settings.read",
  "platform.settings.update",
  "platform.branding.update",
  "platform.homepage.update",

  // Appended last: the seed derives permission ids from list position.
  "lesson.video.import_youtube",

  // Analytics by tab: Overview, and one per tab the advanced analytics
  // plugin adds. Only the names live here; the tabs are the plugin's.
  "analytics.overview.read",
  "analytics.learning.read",
  "analytics.learners.read",
  "analytics.conversion.read",
  "analytics.delivery.read",
  "analytics.storage.read",
  "analytics.video_quality.read",
] as const;

/** Every key that opens a section of the Analytics page. */
export const analyticsPermissions = [
  "analytics.overview.read",
  "analytics.revenue.read",
  "analytics.course.read",
  "analytics.learning.read",
  "analytics.learners.read",
  "analytics.conversion.read",
  "analytics.delivery.read",
  "analytics.storage.read",
  "analytics.video_quality.read",
] as const satisfies readonly (typeof permissions)[number][];

export type Permission = (typeof permissions)[number];

export const permissionSchema = z.enum(
  permissions as unknown as [Permission, ...Permission[]],
);

/**
 * Standard system role keys
 */
export const systemRoleKeys = [
  "admin",
  "course_manager",
  "content_editor",
  "thumbnail_editor",
  "instructor",
  "teaching_assistant",
  "reviewer",
  "analytics_viewer",
] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];

export const systemRoleKeySchema = z.enum(
  systemRoleKeys as unknown as [SystemRoleKey, ...SystemRoleKey[]],
);

/**
 * Resource Scope Types: Platform or Course
 */
export const scopeTypes = ["platform", "course"] as const;
export type ScopeType = (typeof scopeTypes)[number];
export const scopeTypeSchema = z.enum(["platform", "course"]);

/**
 * Features catalogue keys
 */
export const featureKeys = [
  "quizzes",
  "certificates",
  "payments",
  "live_classes",
  "discussions",
  "custom_branding",
  "advanced_analytics",
  "team_custom_roles",
] as const;

export type FeatureKey = (typeof featureKeys)[number];
export const featureKeySchema = z.enum(
  featureKeys as unknown as [FeatureKey, ...FeatureKey[]],
);

// --- Capabilities Schemas (for UI & authorization context) ---

export const capabilitiesQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
});

export type CapabilitiesQuery = z.infer<typeof capabilitiesQuerySchema>;

export const capabilitiesResponseSchema = z.object({
  permissions: z.array(z.string()),
  /**
   * The permissions held through a role that reaches every course. An
   * instructor's course permissions are in `permissions` but not here:
   * they cover only the instructor's own courses.
   */
  academyPermissions: z.array(z.string()),
});

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;

// --- Granular Course Patch Schemas ---

export const updateCourseDetailsSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(500).optional().nullable(),
    description: z.string().max(20000).optional().nullable(),
    language: z.string().max(10).optional(),
    level: z
      .enum(["beginner", "intermediate", "advanced", "all_levels"])
      .optional(),
    categoryId: z.string().uuid().optional().nullable(),
    version: z.number().int().positive().optional(),
  })
  .strict();

export type UpdateCourseDetailsRequest = z.infer<
  typeof updateCourseDetailsSchema
>;

export const updateCourseThumbnailSchema = z
  .object({
    thumbnailUrl: z.string().url().max(2048),
    thumbnailMediaId: z.string().uuid().optional().nullable(),
    version: z.number().int().positive().optional(),
  })
  .strict();

export type UpdateCourseThumbnailRequest = z.infer<
  typeof updateCourseThumbnailSchema
>;

// --- Granular Lesson Patch Schemas ---

export const updateLessonDetailsSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(10000).optional().nullable(),
    isPreview: z.boolean().optional(),
  })
  .strict();

export type UpdateLessonDetailsRequest = z.infer<
  typeof updateLessonDetailsSchema
>;

export const updateLessonVideoSchema = z
  .object({
    videoMediaId: z.string().uuid().nullable(),
    durationSeconds: z.number().int().nonnegative().optional().nullable(),
  })
  .strict();

export type UpdateLessonVideoRequest = z.infer<typeof updateLessonVideoSchema>;

export const updateLessonThumbnailSchema = z
  .object({
    thumbnailUrl: z.string().url().max(2048).nullable(),
    thumbnailMediaId: z.string().uuid().optional().nullable(),
  })
  .strict();

export type UpdateLessonThumbnailRequest = z.infer<
  typeof updateLessonThumbnailSchema
>;

export const updateLessonContentSchema = z
  .object({
    contentJson: z.string().optional(),
    contentText: z.string().optional(),
  })
  .strict();

export type UpdateLessonContentRequest = z.infer<
  typeof updateLessonContentSchema
>;

// --- Role Assignment Contract Schemas ---

export const roleAssignmentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  roleName: z.string(),
  scopeType: scopeTypeSchema,
  courseId: z.string().uuid().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type RoleAssignmentDTO = z.infer<typeof roleAssignmentSchema>;

export const createRoleAssignmentRequestSchema = z
  .object({
    userId: z.string().uuid(),
    roleId: z.string().uuid(),
    scopeType: scopeTypeSchema,
    courseId: z.string().uuid().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.scopeType === "platform") {
        return !data.courseId;
      }
      if (data.scopeType === "course") {
        return Boolean(data.courseId);
      }
      return false;
    },
    {
      message:
        "Invalid scope combination: platform requires no courseId; course requires courseId",
    },
  );

export type CreateRoleAssignmentRequest = z.infer<
  typeof createRoleAssignmentRequestSchema
>;
