import { z } from "zod";

/**
 * The lines of a course's "This course includes" card: what a learner gets
 * with it, each with an icon and a colour. Every course starts with
 * `DEFAULT_COURSE_INCLUDES`, and its editor can change, reorder, remove and
 * add lines.
 */

/** The icons a line can carry; the web app maps each key to its glyph. */
export const COURSE_INCLUDE_ICONS = [
  "calendar-check",
  "monitor-play",
  "certificate",
  "chats-circle",
  "devices",
  "check-circle",
  "download-simple",
  "code",
  "rocket",
  "puzzle-piece",
  "infinity",
  "users-three",
  "briefcase",
  "headset",
  "trophy",
  "lightning",
  "target",
  "star",
  "book-open",
  "file-text",
  "folder-open",
  "clock",
  "chart-line-up",
  "shield-check",
  "gift",
  "video-camera",
  "terminal-window",
  "graduation-cap",
  "medal",
  "lifebuoy",
] as const;

export type CourseIncludeIcon = (typeof COURSE_INCLUDE_ICONS)[number];

export const courseIncludeIconSchema = z.enum(COURSE_INCLUDE_ICONS);

/** A colour as `#rrggbb`. */
export const courseIncludeColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/iu, "Use a colour like #5da9ff.");

/**
 * - `custom`: the editor's own words.
 * - `video`: how much video the course has, written from its curriculum
 *   (length, sections, lessons) so it is always right; its icon and colour
 *   are the editor's.
 */
export const courseIncludeKindSchema = z.enum(["custom", "video"]);
export type CourseIncludeKind = z.infer<typeof courseIncludeKindSchema>;

/**
 * Colours that sit well together on light and dark pages. A new line takes
 * the first one no other line uses.
 */
export const COURSE_INCLUDE_PALETTE = [
  "#5da9ff",
  "#f472b6",
  "#fbbf24",
  "#4ade80",
  "#a16cff",
  "#2dd4bf",
  "#fb923c",
  "#f87171",
  "#38bdf8",
  "#c084fc",
  "#a3e635",
  "#e879f9",
] as const;

export interface CourseIncludePreset {
  kind: CourseIncludeKind;
  text: string;
  detail: string | null;
  icon: CourseIncludeIcon;
  color: string;
}

/** The lines every course starts with (the user's list, 2026-10-16). */
export const DEFAULT_COURSE_INCLUDES: readonly CourseIncludePreset[] = [
  {
    kind: "custom",
    text: "3 years of access",
    detail: "Watch every lesson as often as you like",
    icon: "calendar-check",
    color: "#5da9ff",
  },
  {
    kind: "video",
    text: "On-demand video",
    detail: null,
    icon: "monitor-play",
    color: "#f472b6",
  },
  {
    kind: "custom",
    text: "Certificate of completion",
    detail: "Yours once you finish the course",
    icon: "certificate",
    color: "#fbbf24",
  },
  {
    kind: "custom",
    text: "Doubt support in Discussions",
    detail: "Ask under any lesson and get answers",
    icon: "chats-circle",
    color: "#4ade80",
  },
  {
    kind: "custom",
    text: "Smooth player on any device",
    detail: "Phone, tablet or laptop, no distractions",
    icon: "devices",
    color: "#a16cff",
  },
];

/** Lines the editor can add with one click, beyond the defaults. */
export const SUGGESTED_COURSE_INCLUDES: readonly Omit<
  CourseIncludePreset,
  "color"
>[] = [
  {
    kind: "custom",
    text: "Downloadable lectures",
    detail: "Save lessons and watch them offline",
    icon: "download-simple",
  },
  {
    kind: "custom",
    text: "Downloadable resources",
    detail: "Slides, notes and files for every lesson",
    icon: "folder-open",
  },
  {
    kind: "custom",
    text: "Source code",
    detail: "Every project's code, ready to run",
    icon: "code",
  },
  {
    kind: "custom",
    text: "Real-world projects",
    detail: "Build what you learn as you go",
    icon: "rocket",
  },
  {
    kind: "custom",
    text: "Quizzes and assignments",
    detail: "Check your understanding as you go",
    icon: "puzzle-piece",
  },
  {
    kind: "custom",
    text: "Lifetime updates",
    detail: "New lessons as the course grows",
    icon: "infinity",
  },
  {
    kind: "custom",
    text: "Community access",
    detail: "Learn alongside other students",
    icon: "users-three",
  },
  {
    kind: "custom",
    text: "Interview preparation",
    detail: "The questions that come up, answered",
    icon: "briefcase",
  },
  {
    kind: "custom",
    text: "Priority support",
    detail: "Your questions answered first",
    icon: "headset",
  },
];

/** How many lines a course's card can have. */
export const MAX_COURSE_INCLUDES = 10;

/** The most characters in a line's title and in its detail. */
export const COURSE_INCLUDE_TEXT_MAX = 60;
export const COURSE_INCLUDE_DETAIL_MAX = 90;
