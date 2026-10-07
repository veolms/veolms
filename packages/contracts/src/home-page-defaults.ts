/**
 * The home page an academy shows to signed-out visitors, as its admin
 * configures it.
 *
 * This file deliberately has no dependencies: the web app's public home page
 * imports the defaults from here (`@veolms/contracts/home-page-defaults`)
 * without pulling the validation schemas into its first-load bundle. The
 * schemas that validate these shapes live in `home.ts`.
 */

export const HOME_PAGE_HIGHLIGHT_COUNT = 4;
/** How many courses a home page row can show at its widest. */
export const HOME_PAGE_COURSES_PER_SECTION = 4;
/** A row never shows more, so a hand-picked list never needs more. */
export const HOME_PAGE_MAX_SELECTED_COURSES = HOME_PAGE_COURSES_PER_SECTION;
/** How many comments the home page holds, shown a page at a time. */
export const HOME_PAGE_DISCUSSION_COUNT = 36;
export const HOME_PAGE_DISCUSSIONS_PER_PAGE = 6;
export const HOME_PAGE_MAX_PINNED_DISCUSSIONS = 5;
export const HOME_PAGE_MAX_HIDDEN_DISCUSSIONS = 200;

export interface HomePageHero {
  headline: string;
  /** The second headline line, shown in the accent colour. May be empty. */
  highlightedHeadline: string;
  description: string;
  primaryActionLabel: string;
  /** Scrolls to the free courses. Empty hides the action. */
  secondaryActionLabel: string;
}

export interface HomePageHighlight {
  title: string;
  description: string;
}

export interface HomePageHighlights {
  visible: boolean;
  items: HomePageHighlight[];
}

export interface HomePageCourseSection {
  visible: boolean;
  title: string;
  subtitle: string;
  /** `automatic` ranks courses by enrolments; `manual` shows `courseIds`. */
  selection: "automatic" | "manual";
  courseIds: string[];
}

export interface HomePageDiscussionSection {
  visible: boolean;
  title: string;
  /** Shown first, in this order. */
  pinnedThreadIds: string[];
  /** Never shown on the home page. */
  hiddenThreadIds: string[];
}

export interface HomePageSettings {
  hero: HomePageHero;
  highlights: HomePageHighlights;
  popularCourses: HomePageCourseSection;
  freeCourses: HomePageCourseSection;
  discussions: HomePageDiscussionSection;
}

export const DEFAULT_HOME_PAGE_SETTINGS: HomePageSettings = {
  hero: {
    headline: "Learn In Depth.",
    highlightedHeadline: "Build With Confidence.",
    description:
      "Deep understanding and practical foundations give you the confidence to build beyond tutorials.",
    primaryActionLabel: "Explore Courses",
    secondaryActionLabel: "Try a free course",
  },
  highlights: {
    visible: true,
    items: [
      { title: "In-depth", description: "Go beyond the basics." },
      { title: "Practical", description: "Hands-on exercises." },
      { title: "Foundations", description: "Build solid concepts." },
      { title: "Confidence", description: "Build real projects." },
    ],
  },
  popularCourses: {
    visible: true,
    title: "Popular Courses",
    subtitle: "Most loved by our learners.",
    selection: "automatic",
    courseIds: [],
  },
  freeCourses: {
    visible: true,
    title: "Learn for Free",
    subtitle: "Start learning right away. No payment required.",
    selection: "automatic",
    courseIds: [],
  },
  discussions: {
    visible: true,
    title: "What Students Say",
    pinnedThreadIds: [],
    hiddenThreadIds: [],
  },
};
