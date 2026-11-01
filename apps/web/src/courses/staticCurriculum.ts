import type {
  CourseOverviewResponse,
  CoursePublicCurriculum,
} from "@veolms/contracts";

/**
 * Sections whose lessons a course page carries in its own document: the
 * ones its curriculum shows before "Show all sections". The rest of the
 * curriculum is a file of its own (`staticCurriculumUrl`), loaded when the
 * page is idle or when the reader asks for it, so a course of a thousand
 * lessons has a page no bigger than one of thirty.
 */
export const SECTIONS_IN_COURSE_PAGE = 3;

/**
 * A curriculum of at most this many sections is shown whole at once, so its
 * page carries all of it (the curriculum list's own threshold).
 */
export const SECTIONS_SHOWN_IN_FULL = 4;

/** What a course page is built with: the start of its public curriculum. */
export interface CourseCurriculumPreview {
  /** Its sections are the first ones only, unless `complete`. */
  curriculum: CoursePublicCurriculum;
  /** How many sections the whole curriculum has. */
  totalSections: number;
  complete: boolean;
  /**
   * Whether the course is paid, as it was when the page was built: the
   * curriculum marks a paid course's free lessons, and the hero offers the
   * first of them, from the first paint. Never its price: a page is built
   * with a shimmer where the price goes, and the price comes from the API
   * (see `liveCoursePrices.ts`).
   */
  pricingType: CoursePricingType | null;
}

type CoursePricingType = NonNullable<
  CourseOverviewResponse["pricing"]
>["pricingType"];

export function toCurriculumPreview(
  curriculum: CoursePublicCurriculum,
  pricingType: CoursePricingType | null,
): CourseCurriculumPreview {
  const totalSections = curriculum.sections.length;
  const complete = totalSections <= SECTIONS_SHOWN_IN_FULL;
  return {
    pricingType,
    curriculum: complete
      ? curriculum
      : {
          ...curriculum,
          sections: [...curriculum.sections]
            .sort((a, b) => a.position - b.position)
            .slice(0, SECTIONS_IN_COURSE_PAGE),
        },
    totalSections,
    complete,
  };
}

/**
 * Where a built site keeps a course's whole public curriculum. The version
 * travels in the query, so a page built with one version is never handed
 * another one's copy by a cache along the way. Without a version it is
 * whichever copy the site was built with (the file is revalidated on every
 * request, so a cache does not hand out an older one).
 */
export function staticCurriculumUrl(
  courseSlug: string,
  version: string | null,
) {
  const path = `/static/courses/${encodeURIComponent(courseSlug)}/curriculum.json`;
  return version === null ? path : `${path}?v=${encodeURIComponent(version)}`;
}

/**
 * A public curriculum in the shape the course page draws: the overview, with
 * the price the viewer's access answer carries (null until it has come).
 */
export function curriculumToOverview(
  curriculum: CoursePublicCurriculum,
  pricing: CourseOverviewResponse["pricing"],
): CourseOverviewResponse {
  const { version: _version, ...overview } = curriculum;
  return { ...overview, pricing };
}
