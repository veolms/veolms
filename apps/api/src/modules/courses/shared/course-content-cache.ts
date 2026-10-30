import { cacheTags, createCache } from "@veolms/api-core";
import type {
  CourseOverviewResponse,
  CoursePublicCurriculum,
} from "@veolms/contracts";

import { config } from "../../../config.ts";

/**
 * A course as every visitor sees it: the overview a signed-out visitor gets,
 * and the public curriculum (that overview without the price, with its
 * version). Both are the same for whoever asks, and building them costs
 * about a dozen queries plus a hash of the whole curriculum. The course
 * pages, the signed-out overview and every `/courses/:id/access` answer
 * (for `curriculumVersion`) read it.
 *
 * Entries are labelled with their course and `site`, so a write to the
 * course (`detectSiteContentChange`, in api-core's factory) or a site-wide
 * change clears them in every process. COURSE_CACHE_TTL_MS bounds what is
 * missed (at most 30 s, so a signed thumbnail URL inside is never served
 * expired). Failed loads, an unknown or unpublished course, are not kept.
 */
export interface PublicCourseContent {
  courseId: string;
  /** The overview as a signed-out visitor gets it. */
  overview: CourseOverviewResponse;
  curriculum: CoursePublicCurriculum;
}

const publicCourseContent = createCache<PublicCourseContent>({
  name: "courses.public-content",
  ttlMs: config.COURSE_CACHE_TTL_MS,
  maxBytes: 32 * 1024 * 1024,
});

/**
 * The course by `courseIdOrSlug`, from the cache when it is fresh, otherwise
 * from `load`.
 */
export async function getCachedPublicCourseContent(
  courseIdOrSlug: string,
  load: () => Promise<PublicCourseContent>,
  /** Whether the key is a course id (rather than a slug). */
  keyIsCourseId: boolean,
): Promise<PublicCourseContent> {
  return await publicCourseContent.fetch(
    courseIdOrSlug,
    load,
    keyIsCourseId
      ? { tags: [cacheTags.course(courseIdOrSlug), cacheTags.site] }
      : {
          tags: [cacheTags.site],
          tagsOf: (content) => [cacheTags.course(content.courseId)],
        },
  );
}
