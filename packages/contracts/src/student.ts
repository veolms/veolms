import { z } from "zod";
import { enrollmentStatusSchema } from "./course/enrollment.ts";
import { phoneNumberSchema } from "./auth/user.ts";

/**
 * Summary representation of a student learner in list views.
 */
export const studentSummarySchema = z.strictObject({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().email().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  joinedAt: z.string().or(z.date()),
  enrolledCoursesCount: z.number().int().nonnegative(),
  completedCoursesCount: z.number().int().nonnegative(),
  averageProgressPercent: z.number().min(0).max(100),
  lastActiveAt: z.string().or(z.date()).nullable().optional(),
  enrolledCoursesPreview: z
    .array(
      z.strictObject({
        id: z.string().uuid(),
        title: z.string(),
        slug: z.string(),
        progressPercent: z.number().min(0).max(100),
      }),
    )
    .optional(),
});
export type StudentSummary = z.infer<typeof studentSummarySchema>;

/**
 * Lean representation used by the paginated student list.
 * Keep list rows small because this payload is retained by the infinite query.
 */
export const studentListItemSchema = z.strictObject({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().email().nullable().optional(),
  /** Admins only; null for instructors and learners without a number. */
  phoneNo: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  joinedAt: z.string().or(z.date()),
  enrolledCoursesCount: z.number().int().nonnegative(),
  completedCoursesCount: z.number().int().nonnegative(),
  averageProgressPercent: z.number().min(0).max(100),
});
export type StudentListItem = z.infer<typeof studentListItemSchema>;

/**
 * Query parameters for cursor-based paginated student lists.
 */
export const studentListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  courseId: z.string().uuid().optional(),
  status: z
    .enum(["all", "active", "completed", "inactive"])
    .default("all")
    .optional(),
  sortBy: z
    .enum(["recent", "name", "courses", "progress"])
    .default("recent")
    .optional(),
});
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;

/**
 * Response envelope for cursor-based student lists.
 */
export const studentListResponseSchema = z.strictObject({
  students: z.array(studentListItemSchema),
  nextCursor: z.string().nullable(),
  /** Sent with the first page only (no cursor). */
  totalCount: z.number().int().nonnegative().optional(),
});
export type StudentListResponse = z.infer<typeof studentListResponseSchema>;

/**
 * Path parameter schema for querying a student by username.
 */
export const studentUsernameParamsSchema = z.object({
  username: z.string().min(1).max(100),
});
export type StudentUsernameParams = z.infer<typeof studentUsernameParamsSchema>;

/**
 * Detailed representation of a course enrolled by a student.
 */
export const studentCourseDetailSchema = z.strictObject({
  courseId: z.string().uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  courseDescription: z.string().nullable().optional(),
  courseThumbnailUrl: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  enrolledAt: z.string().or(z.date()),
  enrollmentSource: z.string(),
  /**
   * Whether the learner can open the course now. An enrollment whose access
   * period has run out reads "expired" even while its row still says active.
   */
  accessStatus: enrollmentStatusSchema,
  /**
   * The order this enrollment came from, and whether that order can still be
   * refunded. Sent to admins only; null and false for everyone else and for
   * an enrollment no order paid for.
   */
  orderId: z.string().uuid().nullable(),
  refundable: z.boolean(),
  progressPercent: z.number().min(0).max(100),
  completedLessonsCount: z.number().int().nonnegative(),
  totalLessonsCount: z.number().int().nonnegative(),
  lastAccessedAt: z.string().or(z.date()).nullable().optional(),
});
export type StudentCourseDetail = z.infer<typeof studentCourseDetailSchema>;

/**
 * Full details response for a specific student (/students/:username).
 */
export const studentDetailResponseSchema = z.strictObject({
  student: z.strictObject({
    id: z.string().uuid(),
    username: z.string(),
    displayName: z.string(),
    email: z.string().email().nullable().optional(),
    phoneNo: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    joinedAt: z.string().or(z.date()),
    socials: z.strictObject({
      githubUrl: z.string().nullable().optional(),
      linkedinUrl: z.string().nullable().optional(),
      websiteUrl: z.string().nullable().optional(),
    }),
  }),
  metrics: z.strictObject({
    enrolledCoursesCount: z.number().int().nonnegative(),
    completedCoursesCount: z.number().int().nonnegative(),
    inProgressCoursesCount: z.number().int().nonnegative(),
    averageProgressPercent: z.number().min(0).max(100),
    totalLessonsCompleted: z.number().int().nonnegative(),
  }),
  courses: z.array(studentCourseDetailSchema),
});
export type StudentDetailResponse = z.infer<typeof studentDetailResponseSchema>;

/**
 * An admin's change to a learner's contact details (PATCH
 * /students/:username/contact). The email is required: it can be changed but
 * never removed. A null phone number removes it. A changed email or number is
 * saved unverified, so the learner confirms it by code.
 */
export const studentContactUpdateRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phoneNo: phoneNumberSchema.nullable(),
});
export type StudentContactUpdateRequest = z.infer<
  typeof studentContactUpdateRequestSchema
>;

export const studentContactUpdateResponseSchema = z.strictObject({
  email: z.string().email(),
  phoneNo: z.string().nullable(),
});
export type StudentContactUpdateResponse = z.infer<
  typeof studentContactUpdateResponseSchema
>;
