import { z } from "zod";

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
 * Query parameters for cursor-based paginated student lists.
 */
export const studentListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
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
  students: z.array(studentSummarySchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
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
  enrollmentStatus: z.string(),
  enrollmentSource: z.string(),
  accessExpiresAt: z.string().or(z.date()).nullable().optional(),
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
    lastActiveAt: z.string().or(z.date()).nullable().optional(),
  }),
  courses: z.array(studentCourseDetailSchema),
});
export type StudentDetailResponse = z.infer<typeof studentDetailResponseSchema>;
