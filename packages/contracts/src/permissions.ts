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
] as const;

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
  courseId: z.string().uuid().optional().nullable(),
  permissions: z.array(z.string()),
  features: z.record(z.string(), z.boolean()),
});

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;

// --- Granular Course Patch Schemas ---

export const updateCourseDetailsSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(500).optional().nullable(),
    description: z.string().max(20000).optional().nullable(),
    language: z.string().max(10).optional(),
    level: z.enum(["beginner", "intermediate", "advanced", "all_levels"]).optional(),
    categoryId: z.string().uuid().optional().nullable(),
  })
  .strict();

export type UpdateCourseDetailsRequest = z.infer<typeof updateCourseDetailsSchema>;

export const updateCourseThumbnailSchema = z
  .object({
    thumbnailUrl: z.string().url().max(2048),
    thumbnailMediaId: z.string().uuid().optional().nullable(),
  })
  .strict();

export type UpdateCourseThumbnailRequest = z.infer<typeof updateCourseThumbnailSchema>;

// --- Granular Lesson Patch Schemas ---

export const updateLessonDetailsSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(10000).optional().nullable(),
    isPreview: z.boolean().optional(),
  })
  .strict();

export type UpdateLessonDetailsRequest = z.infer<typeof updateLessonDetailsSchema>;

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

export type UpdateLessonThumbnailRequest = z.infer<typeof updateLessonThumbnailSchema>;

export const updateLessonContentSchema = z
  .object({
    contentJson: z.string().optional(),
    contentText: z.string().optional(),
  })
  .strict();

export type UpdateLessonContentRequest = z.infer<typeof updateLessonContentSchema>;

// --- Role Assignment Contract Schemas ---

export const roleAssignmentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  roleKey: z.string().nullable().optional(),
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

export type CreateRoleAssignmentRequest = z.infer<typeof createRoleAssignmentRequestSchema>;
