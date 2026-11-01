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
 * marked as previews, and the course's first lesson when
 * `firstLessonOpen` says so.
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
   * Where a signed-in viewer with `full` access carries on; null for
   * anyone else.
   */
  resume: courseAccessResumeSchema.nullable(),
  /**
   * When the signed-in learner's enrolment ends; null for one that does
   * not end, or for a viewer who is not enrolled. Absent from a response
   * built before the field existed.
   */
  accessExpiresAt: z.string().nullable().optional(),
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
export type CourseAccessResponse = z.infer<typeof courseAccessResponseSchema>;
export type CoursePublicCurriculum = z.infer<
  typeof coursePublicCurriculumSchema
>;
