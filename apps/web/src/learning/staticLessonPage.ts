import type {
  CourseLesson,
  CourseOverviewResponse,
  CoursePublicCurriculum,
  LessonDiscussionKind,
  LessonDiscussionsListResponse,
} from "@veolms/contracts";
import { curriculumToOverview } from "../courses/staticCurriculum";

/**
 * How many of a lesson's discussions its page is built with: the first ones
 * in the order the discussions open with (Top: the most liked, then the
 * oldest). The rest load as the reader scrolls, as before.
 */
export const DISCUSSIONS_IN_LESSON_PAGE = 10;

/**
 * The sections the lesson page's curriculum opens with besides the open
 * lesson's own: the first ones (`getInitialCurriculumExpandedSections`).
 */
const SECTIONS_OPEN_AT_FIRST = 2;

/**
 * What a lesson page (`/learn/<course>/lecture-N`) is built with, the same
 * for every visitor: the course with all of its section headings, and the
 * lessons of the sections its curriculum opens with (the open lesson's own
 * and the first ones), the lesson's description among them.
 * The rest of the curriculum is the course's file (`staticCurriculumUrl`),
 * which the page asks for at once; until it is in, every other section is
 * drawn from its count and length alone.
 */
export interface LessonPageSeed {
  /** Every section; only the ones open at first have their lessons. */
  curriculum: CoursePublicCurriculum;
  /** For each section whose lessons were left out: how many, how long. */
  omittedSections: Record<string, { lessons: number; durationSeconds: number }>;
  /** The open lesson's number, counted across the whole course from 1. */
  lessonNumber: number;
  lessonId: string;
  /** Its first discussions, as the page opens them; null when it has none to show. */
  discussions: {
    kind: LessonDiscussionKind;
    page: LessonDiscussionsListResponse;
  } | null;
  /** When the build read the discussions (ms since the epoch). */
  builtAt: number;
}

/** The sections in the order learners meet them, each with its lessons in order. */
function orderedSections(curriculum: CoursePublicCurriculum) {
  return [...curriculum.sections]
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      section,
      lessons: [...(section.lessons ?? [])].sort(
        (a, b) => a.position - b.position,
      ),
    }));
}

/** The lesson the page for `lessonNumber` shows, or nothing past the end. */
export function findCurriculumLesson(
  curriculum: CoursePublicCurriculum,
  lessonNumber: number,
): CourseLesson | undefined {
  let number = 0;
  for (const { lessons } of orderedSections(curriculum)) {
    for (const lesson of lessons) {
      number += 1;
      if (number === lessonNumber) return lesson;
    }
  }
  return undefined;
}

/** How many lessons the curriculum numbers. */
export function countCurriculumLessons(curriculum: CoursePublicCurriculum) {
  return curriculum.sections.reduce(
    (total, section) => total + (section.lessons?.length ?? 0),
    0,
  );
}

/**
 * The discussion kind a lesson's discussions open on for this course: the
 * one kind there is when the course allows one only, otherwise all of them
 * (`Discussion`'s first filter). Null when the course allows none.
 */
export function openingDiscussionKind(
  settings: CoursePublicCurriculum["settings"],
): LessonDiscussionKind | null {
  const kinds: LessonDiscussionKind[] = [];
  if (settings?.allowComments ?? true) kinds.push("comment");
  if (settings?.allowNotes ?? true) kinds.push("note");
  if (settings?.allowQa ?? true) kinds.push("question");
  if (kinds.length === 0) return null;
  return kinds.length === 1 ? kinds[0]! : "all";
}

export function toLessonPageSeed(
  curriculum: CoursePublicCurriculum,
  lessonNumber: number,
  discussions: LessonPageSeed["discussions"],
  builtAt: number,
): LessonPageSeed | undefined {
  const lesson = findCurriculumLesson(curriculum, lessonNumber);
  if (!lesson) return undefined;
  const omittedSections: LessonPageSeed["omittedSections"] = {};
  const openAtFirst = new Set(
    orderedSections(curriculum)
      .slice(0, SECTIONS_OPEN_AT_FIRST)
      .map(({ section }) => section.id),
  );
  const sections = curriculum.sections.map((section) => {
    if (
      openAtFirst.has(section.id) ||
      section.lessons?.some(({ id }) => id === lesson.id)
    ) {
      return section;
    }
    const lessons = section.lessons ?? [];
    omittedSections[section.id] = {
      lessons: lessons.length,
      durationSeconds: lessons.reduce(
        (total, { durationSeconds }) => total + (durationSeconds ?? 0),
        0,
      ),
    };
    return { ...section, lessons: [] };
  });
  return {
    curriculum: { ...curriculum, sections },
    omittedSections,
    lessonNumber,
    lessonId: lesson.id,
    discussions,
    builtAt,
  };
}

const PLACEHOLDER_LESSON_PREFIX = "pending-lesson:";

/**
 * A stand-in for a lesson a lesson page was not built with: it holds that
 * lesson's place in the numbering, and its section's count and length,
 * until the curriculum file is in. It has no title and is never opened.
 */
export function isPlaceholderLesson(lesson: { id: string }): boolean {
  return lesson.id.startsWith(PLACEHOLDER_LESSON_PREFIX);
}

/**
 * A lesson page's seed in the shape the lesson page draws: the overview,
 * with stand-ins (`isPlaceholderLesson`) for the lessons it left out, so
 * every lesson keeps its number and every section heading its count and
 * length. The first stand-in of a section carries the section's length.
 */
export function lessonPageSeedToOverview(
  seed: LessonPageSeed,
  pricing: CourseOverviewResponse["pricing"],
): CourseOverviewResponse {
  const overview = curriculumToOverview(seed.curriculum, pricing);
  return {
    ...overview,
    sections: overview.sections.map((section) => {
      const omitted = seed.omittedSections[section.id];
      if (!omitted) return section;
      return {
        ...section,
        lessons: Array.from({ length: omitted.lessons }, (_, index) => ({
          id: `${PLACEHOLDER_LESSON_PREFIX}${section.id}:${index}`,
          title: "",
          description: null,
          contentType: "video" as const,
          contentMediaId: undefined,
          durationSeconds: index === 0 ? omitted.durationSeconds : 0,
          position: index,
          isPreview: false,
          isPublished: true,
        })),
      };
    }),
  };
}
