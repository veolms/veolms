import { z } from "zod";
import { courseSummarySchema, type CourseSummary } from "./course/course.ts";

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
