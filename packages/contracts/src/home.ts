import { z } from "zod";

import { type CourseSummary, courseSummarySchema } from "./course/course.ts";

export const homeDiscoveryResponseSchema = z.strictObject({
  popularCourses: z.array(courseSummarySchema),
  freeCourses: z.array(courseSummarySchema),
  recentCourses: z.array(courseSummarySchema),
});

export type HomeDiscoveryResponse = {
  popularCourses: CourseSummary[];
  freeCourses: CourseSummary[];
  recentCourses: CourseSummary[];
};
