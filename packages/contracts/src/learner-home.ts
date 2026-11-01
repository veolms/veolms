import { z } from "zod";
import { enrolledCourseSchema } from "./commerce/enrollment.ts";
import { learningSummaryResponseSchema } from "./learning-goals.ts";
import { learningProgressResumeContextResponseSchema } from "./learning-progress.ts";

/**
 * A signed-in learner's home in one answer: what its hero and its course
 * list are drawn from. Each part is what its own endpoint returns
 * (`/enrollments/courses`, `/learning/summary` and the resume context of one
 * course); they are sent together because the home needs all three at once,
 * and the third could otherwise only be asked for after the first had
 * answered.
 */
export const learnerHomeQuerySchema = z.object({
  /**
   * The course the learner has pinned to their home, which is kept in their
   * browser. It leads the home in place of the course chosen for them, as
   * long as they are enrolled in it; anything else here is ignored.
   */
  pinnedCourseId: z.string().trim().min(1).max(100).optional(),
});
export type LearnerHomeQuery = z.infer<typeof learnerHomeQuerySchema>;

export const learnerHomeResponseSchema = z.strictObject({
  /** The learner's active enrolments, as `/enrollments/courses` lists them. */
  courses: z.array(enrolledCourseSchema),
  /** Their goal progress and streaks, as `/learning/summary` gives them. */
  summary: learningSummaryResponseSchema,
  /**
   * Where the learner is in the course their home leads with (see
   * `planLearnerHome`). Null when they have no course, or when that course
   * can no longer be opened: the course's own endpoint says why.
   */
  resume: learningProgressResumeContextResponseSchema.nullable(),
});
export type LearnerHomeResponse = z.infer<typeof learnerHomeResponseSchema>;
