import { z } from "zod";

import { learningProgressResumeLessonSchema } from "../learning-progress.ts";
import { coursePricingSummarySchema, courseOverviewSchema } from "./course.ts";

/**
 * Who the viewer is to a course:
 *
 * - `guest`: not signed in;
 * - `learner`: signed in, including a creator or admin in their Student
 *   view and a reviewer who may preview every course;
 * - `manager`: the course's creator or an admin, outside the Student view.
 */
export const courseViewerRoleSchema = z.enum(["guest", "learner", "manager"]);

/**
 * `full` when every published lesson opens for the viewer: they manage or
 * review the course, hold a grant for it, or are signed in on a free course
 * that is not restricted. `limited` when only some lessons do: the ones
 * marked as previews, the course's first lesson when `firstLessonOpen`
 * says so, and the lessons of `openSectionIds` when the learner holds part
 * of the course.
 *
 * The same rule the server applies to playback and to lesson text, so a
 * lesson shown unlocked plays and one shown locked is refused.
 */
export const courseAccessLevelSchema = z.enum(["full", "limited"]);

/**
 * What a viewer with `limited` access must do to open the other lessons:
 * `sign-in` (a guest), `purchase` (buy the course, or enrol in it when it is
 * free), or `grant` (an access-restricted free course: only staff can give
 * it). Null when access is `full`.
 */
export const courseLockedLessonsNeedSchema = z.enum([
  "sign-in",
  "purchase",
  "grant",
]);

export const courseAccessProgressSchema = z.strictObject({
  percent: z.number().int().min(0).max(100),
  /** Whether the learner has opened a lesson of the course yet. */
  started: z.boolean(),
  lastAccessedAt: z.string().nullable(),
});

export const courseAccessSummarySchema = z.strictObject({
  courseId: z.uuid(),
  slug: z.string().min(1).max(160),
  viewer: courseViewerRoleSchema,
  access: courseAccessLevelSchema,
  /**
   * Only meaningful with `limited` access: whether the course's first
   * published lesson opens too (a free course that is not restricted opens
   * it to visitors who are not signed in).
   */
  firstLessonOpen: z.boolean(),
  lockedLessonsNeed: courseLockedLessonsNeedSchema.nullable(),
  /**
   * Only with `limited` access: the sections whose lessons open too,
   * because the learner holds part of the course (bought through a course
   * that unlocks only some of its sections). They are enrolled, and their
   * progress, resume and discussions work as for the whole course. Absent
   * when they hold none of it that way.
   */
  openSectionIds: z.array(z.uuid()).optional(),
  /** An active enrolment: the course is in the learner's My Courses. */
  enrolled: z.boolean(),
  /** See `courseOverviewSchema.canSelfEnroll`. */
  canSelfEnroll: z.boolean(),
  /** The price in force now, which every viewer is offered. */
  pricing: coursePricingSummarySchema,
  /** The learner's progress; null unless they are enrolled. */
  progress: courseAccessProgressSchema.nullable(),
});

/** `GET /courses/access`: every published course, for the catalogue. */
export const courseAccessListResponseSchema = z.strictObject({
  courses: z.array(courseAccessSummarySchema),
});

export const courseAccessResumeSchema = z.strictObject({
  totalLessons: z.number().int().nonnegative(),
  completedLessons: z.number().int().nonnegative(),
  resumeLesson: learningProgressResumeLessonSchema.nullable(),
});

/**
 * The order that enrolled the learner, as the course page names it. Money
 * is in minor units (paise), like every order response.
 */
export const courseAccessEnrollmentOrderSchema = z.strictObject({
  id: z.uuid(),
  orderNumber: z.string().min(1),
  totalAmount: z.number().int().nonnegative(),
  currency: z.string().min(1),
  /** The gateway's word for how it was paid ("upi", "card"); null when unknown. */
  paymentMethod: z.string().nullable(),
  /** Whether an invoice was issued: only a paid order has one. */
  hasInvoice: z.boolean(),
});

/**
 * How fast the learner gets through the course: lessons completed a week
 * over their recent weeks of study, and when they would finish at that
 * rate. Null until there is enough activity to say.
 */
export const courseAccessPaceSchema = z.strictObject({
  lessonsPerWeek: z.number().nonnegative(),
  /** Null when no lessons are left, or none were finished lately. */
  projectedFinishAt: z.string().nullable(),
});

/** The learner's enrolment, for the "Your enrollment" panel. */
export const courseAccessEnrollmentSchema = z.strictObject({
  /** When the order was paid; when access began for a grant without one. */
  enrolledAt: z.string(),
  /**
   * Null for a free or staff grant, which has no order to show. For a
   * course that came with another (a link), the order of that course.
   */
  order: courseAccessEnrollmentOrderSchema.nullable(),
  /**
   * The course this one came with, when a link gave it: "Core Concepts
   * Edition". Absent otherwise.
   */
  includedWith: z.string().optional(),
  pace: courseAccessPaceSchema.nullable(),
});

/** `GET /courses/:idOrSlug/access`: one course, for its pages. */
export const courseAccessResponseSchema = courseAccessSummarySchema.extend({
  /**
   * Whether the viewer may post in the course's lesson discussions: its
   * creator, staff who read every course's discussions, and learners
   * holding a grant. A
   * free course that is open to everyone plays for a learner who never
   * enrolled, but they post only once enrolled.
   */
  mayJoinDiscussions: z.boolean(),
  /**
   * Where a signed-in viewer with `full` access, or with `openSectionIds`,
   * carries on; null for anyone else.
   */
  resume: courseAccessResumeSchema.nullable(),
  /**
   * When the signed-in learner's enrolment ends; null for one that does
   * not end, or for a viewer who is not enrolled. Absent from a response
   * built before the field existed.
   */
  accessExpiresAt: z.string().nullable().optional(),
  /**
   * The signed-in learner's enrolment; null for a viewer who is not
   * enrolled. Absent from a response built before the field existed.
   */
  enrollment: courseAccessEnrollmentSchema.nullable().optional(),
  /**
   * The version of the course's public curriculum now. A page built from an
   * older copy (`version` of `GET /courses/:idOrSlug/curriculum`) knows the
   * course changed after it was built and asks for the curriculum again.
   */
  curriculumVersion: z.string().min(1),
});

/**
 * `GET /courses/:idOrSlug/curriculum`: what a published course's pages show
 * every visitor, the same for anyone who asks. It is the course overview as
 * a visitor who is not signed in gets it, without the price (which is read
 * live from the access endpoints): published lessons only, a lesson's text
 * only where every visitor may read it, and attachments counted but not
 * named. A course that is not published is not found.
 */
export const coursePublicCurriculumSchema = courseOverviewSchema
  .omit({ pricing: true })
  .extend({
    version: z.string().min(1),
  });

export type CourseViewerRole = z.infer<typeof courseViewerRoleSchema>;
export type CourseAccessLevel = z.infer<typeof courseAccessLevelSchema>;
export type CourseLockedLessonsNeed = z.infer<
  typeof courseLockedLessonsNeedSchema
>;
export type CourseAccessProgress = z.infer<typeof courseAccessProgressSchema>;
export type CourseAccessSummary = z.infer<typeof courseAccessSummarySchema>;
export type CourseAccessListResponse = z.infer<
  typeof courseAccessListResponseSchema
>;
export type CourseAccessResume = z.infer<typeof courseAccessResumeSchema>;
export type CourseAccessEnrollmentOrder = z.infer<
  typeof courseAccessEnrollmentOrderSchema
>;
export type CourseAccessPace = z.infer<typeof courseAccessPaceSchema>;
export type CourseAccessEnrollment = z.infer<
  typeof courseAccessEnrollmentSchema
>;
export type CourseAccessResponse = z.infer<typeof courseAccessResponseSchema>;
export type CoursePublicCurriculum = z.infer<
  typeof coursePublicCurriculumSchema
>;
