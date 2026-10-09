import { z } from "zod";
import { courseSummarySchema, type CourseSummary } from "./course/course.ts";
import {
  HOME_PAGE_HIGHLIGHT_COUNT,
  HOME_PAGE_MAX_HIDDEN_DISCUSSIONS,
  HOME_PAGE_MAX_PINNED_DISCUSSIONS,
  HOME_PAGE_MAX_SELECTED_COURSES,
  type HomePageCourseSection,
  type HomePageDiscussionSection,
  type HomePageHero,
  type HomePageHighlights,
  type HomePageSettings,
} from "./home-page-defaults.ts";
import {
  publicPopularDiscussionSchema,
  type PublicPopularDiscussion,
} from "./interactions/public.ts";

export * from "./home-page-defaults.ts";

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

// ---------------------------------------------------------------------------
// Home page settings: what an admin configures for the signed-out home page.
// The plain types and the defaults live in `home-page-defaults.ts`, which has
// no dependencies so the public page can import it without these schemas.
// ---------------------------------------------------------------------------

export const homePageHeroSchema = z.strictObject({
  headline: z.string().trim().min(1).max(60),
  highlightedHeadline: z.string().trim().max(60),
  description: z.string().trim().max(240),
  primaryActionLabel: z.string().trim().min(1).max(30),
  secondaryActionLabel: z.string().trim().max(30),
}) satisfies z.ZodType<HomePageHero>;

export const homePageHighlightsSchema = z.strictObject({
  visible: z.boolean(),
  items: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(30),
        description: z.string().trim().max(60),
      }),
    )
    .length(HOME_PAGE_HIGHLIGHT_COUNT),
}) satisfies z.ZodType<HomePageHighlights>;

const uniqueIds = (max: number) =>
  z
    .array(z.uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Each item can only be listed once.",
    });

export const homePageCourseSectionSchema = z.strictObject({
  visible: z.boolean(),
  title: z.string().trim().min(1).max(40),
  subtitle: z.string().trim().max(120),
  selection: z.enum(["automatic", "manual"]),
  courseIds: uniqueIds(HOME_PAGE_MAX_SELECTED_COURSES),
}) satisfies z.ZodType<HomePageCourseSection>;

export const homePageDiscussionSectionSchema = z.strictObject({
  visible: z.boolean(),
  title: z.string().trim().min(1).max(40),
  pinnedThreadIds: uniqueIds(HOME_PAGE_MAX_PINNED_DISCUSSIONS),
  hiddenThreadIds: uniqueIds(HOME_PAGE_MAX_HIDDEN_DISCUSSIONS),
}) satisfies z.ZodType<HomePageDiscussionSection>;

export const homePageSettingsSchema = z.strictObject({
  hero: homePageHeroSchema,
  highlights: homePageHighlightsSchema,
  popularCourses: homePageCourseSectionSchema,
  freeCourses: homePageCourseSectionSchema,
  discussions: homePageDiscussionSectionSchema,
}) satisfies z.ZodType<HomePageSettings>;

export const updateHomePageSettingsRequestSchema = homePageSettingsSchema;
export type UpdateHomePageSettingsRequest = HomePageSettings;

export const homePageSettingsResponseSchema = z.strictObject({
  settings: homePageSettingsSchema,
  /** Null until an admin saves for the first time (the defaults apply). */
  updatedAt: z.string().nullable(),
});
export type HomePageSettingsResponse = z.infer<
  typeof homePageSettingsResponseSchema
>;

export const homePageCourseOptionSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  isFree: z.boolean(),
});
export type HomePageCourseOption = z.infer<typeof homePageCourseOptionSchema>;

/** What the settings editor can choose from. */
export const homePageOptionsResponseSchema = z.strictObject({
  courses: z.array(homePageCourseOptionSchema),
  discussions: z.array(publicPopularDiscussionSchema),
});
export type HomePageOptionsResponse = z.infer<
  typeof homePageOptionsResponseSchema
>;

const guestHomeCourseSectionSchema = z.strictObject({
  visible: z.boolean(),
  title: z.string(),
  subtitle: z.string(),
  courses: z.array(courseSummarySchema),
});

/**
 * The signed-out home page, resolved: the configured copy plus the courses
 * and discussions each section shows. `version` changes whenever an admin
 * saves the settings.
 */
export const guestHomePageResponseSchema = z.strictObject({
  version: z.string(),
  hero: homePageHeroSchema,
  heroLessonPosterUrl: z.string().nullable().optional(),
  highlights: homePageHighlightsSchema,
  popularCourses: guestHomeCourseSectionSchema,
  freeCourses: guestHomeCourseSectionSchema,
  discussions: z.strictObject({
    visible: z.boolean(),
    title: z.string(),
    items: z.array(publicPopularDiscussionSchema),
  }),
});

export interface GuestHomeCourseSection {
  visible: boolean;
  title: string;
  subtitle: string;
  courses: CourseSummary[];
}

export interface GuestHomePageResponse {
  version: string;
  hero: HomePageHero;
  /**
   * The thumbnail of the course whose lesson plays on the hero's laptop
   * (`HOME_PAGE_HERO_LESSON`), whether or not a row shows that course. Null
   * when the course has none or is not published; left out by an API that
   * predates it.
   */
  heroLessonPosterUrl?: string | null;
  highlights: HomePageHighlights;
  popularCourses: GuestHomeCourseSection;
  freeCourses: GuestHomeCourseSection;
  discussions: {
    visible: boolean;
    title: string;
    items: PublicPopularDiscussion[];
  };
}
