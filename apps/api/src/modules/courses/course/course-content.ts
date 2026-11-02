import { cacheTags, createCache } from "@veolms/api-core";

import type { AuthService } from "../../auth/index.ts";
import type { MediaService } from "../../media/index.ts";
import type { CategoryService } from "../category/category.service.ts";
import type { ConfigurationService } from "../configuration/configuration.service.ts";
import type { CurriculumService } from "../curriculum/curriculum.service.ts";
import type { IncludesService } from "../includes/includes.service.ts";
import type { CourseListResponse } from "@veolms/contracts";
import type {
  listCourseAccessFacts,
  listPublishedCourseOptions,
} from "./course.repository.ts";

/**
 * Everything about a course that is the same for whoever looks at it: its
 * category, its whole curriculum (unpublished lessons included), the media
 * those lessons and their files point at, its rules, price, settings, what
 * is included, and its instructor's name. Every overview, progress read and
 * progress heartbeat starts from it; what a viewer may see of it is decided
 * per request.
 *
 * Labelled with the course and `site` (a category, a finished transcode or
 * an instructor's name change it from outside the course), so any change
 * clears it in every process. The TTL bounds what is missed.
 *
 * Holds no signed URL and nothing about the viewer. Only for reads: a write
 * handler reads what it just changed from the database.
 */
export interface CourseContentSources {
  categoryService: Pick<CategoryService, "findCategoryById">;
  curriculumService: Pick<
    CurriculumService,
    | "findSectionsByCourseId"
    | "findLessonsByCourseId"
    | "listResourcesByCourseId"
  >;
  configurationService: Pick<
    ConfigurationService,
    | "findAccessRuleByCourseId"
    | "findPricingByCourseId"
    | "findSettingsByCourseId"
  >;
  includesService: Pick<IncludesService, "listIncludesForAuthorizedCourse">;
  mediaService: Pick<MediaService, "getMediaAssets">;
  authService: Pick<AuthService, "listUserDisplayNamesByIds">;
}

type Loaded<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

export interface CourseContent {
  category: Loaded<
    CourseContentSources["categoryService"]["findCategoryById"]
  > | null;
  sections: Loaded<
    CourseContentSources["curriculumService"]["findSectionsByCourseId"]
  >;
  lessons: Loaded<
    CourseContentSources["curriculumService"]["findLessonsByCourseId"]
  >;
  resources: Loaded<
    CourseContentSources["curriculumService"]["listResourcesByCourseId"]
  >;
  accessRule: Loaded<
    CourseContentSources["configurationService"]["findAccessRuleByCourseId"]
  >;
  pricing: Loaded<
    CourseContentSources["configurationService"]["findPricingByCourseId"]
  >;
  settings: Loaded<
    CourseContentSources["configurationService"]["findSettingsByCourseId"]
  >;
  includes: Loaded<
    CourseContentSources["includesService"]["listIncludesForAuthorizedCourse"]
  >;
  /** The media of every lesson and every lesson file. */
  media: Loaded<CourseContentSources["mediaService"]["getMediaAssets"]>;
  creator:
    | Loaded<
        CourseContentSources["authService"]["listUserDisplayNamesByIds"]
      >[number]
    | null;
}

export interface CourseContentKey {
  id: string;
  category_id: string | null;
  creator_id: string | null;
}

const COURSE_CONTENT_TTL_MS = 5 * 60_000;

const courseContents = createCache<CourseContent>({
  name: "courses.content",
  ttlMs: COURSE_CONTENT_TTL_MS,
  maxBytes: 64 * 1024 * 1024,
});

async function loadCourseContent(
  sources: CourseContentSources,
  course: CourseContentKey,
): Promise<CourseContent> {
  const [
    category,
    sections,
    lessons,
    resources,
    accessRule,
    pricing,
    settings,
    includes,
    creators,
  ] = await Promise.all([
    course.category_id
      ? sources.categoryService.findCategoryById(course.category_id)
      : null,
    sources.curriculumService.findSectionsByCourseId(course.id),
    sources.curriculumService.findLessonsByCourseId(course.id),
    sources.curriculumService.listResourcesByCourseId(course.id),
    sources.configurationService.findAccessRuleByCourseId(course.id),
    sources.configurationService.findPricingByCourseId(course.id),
    sources.configurationService.findSettingsByCourseId(course.id),
    sources.includesService.listIncludesForAuthorizedCourse(course.id),
    course.creator_id
      ? sources.authService.listUserDisplayNamesByIds([course.creator_id])
      : [],
  ]);

  const mediaIds = new Set<string>();
  for (const lesson of lessons) {
    if (lesson.content_media_id) mediaIds.add(lesson.content_media_id);
  }
  for (const resource of resources) mediaIds.add(resource.media_asset_id);
  // Read without an owner filter: whoever views a course is not who
  // uploaded its media.
  const media =
    mediaIds.size > 0
      ? await sources.mediaService.getMediaAssets([...mediaIds])
      : [];

  return {
    category: category ?? null,
    sections,
    lessons,
    resources,
    accessRule,
    pricing,
    settings,
    includes,
    media,
    creator: creators[0] ?? null,
  };
}

/** The course's content, from the cache while it is fresh. */
export async function getCourseContent(
  sources: CourseContentSources,
  course: CourseContentKey,
): Promise<CourseContent> {
  return await courseContents.fetch(
    course.id.toLowerCase(),
    () => loadCourseContent(sources, course),
    { tags: [cacheTags.course(course.id), cacheTags.site] },
  );
}

/**
 * The price and access rule of every published course: asked by each
 * viewer's `/courses/access`. Cleared by any course change (`catalog`).
 */
export const publishedAccessFacts = createCache<
  Awaited<ReturnType<typeof listCourseAccessFacts>>
>({
  name: "courses.published-access-facts",
  ttlMs: COURSE_CONTENT_TTL_MS,
  maxBytes: 8 * 1024 * 1024,
});

/**
 * Catalogue pages: the same for every visitor, cleared by any course change
 * (`catalog`) or site change. Searches are not cached (every query would be
 * its own entry).
 */
export const catalogPages = createCache<CourseListResponse>({
  name: "courses.catalog-pages",
  ttlMs: COURSE_CONTENT_TTL_MS,
  maxEntries: 2_000,
  maxBytes: 16 * 1024 * 1024,
});

/** Ids and titles of the published courses, for filter controls. */
export const publishedCourseOptions = createCache<
  Awaited<ReturnType<typeof listPublishedCourseOptions>>
>({
  name: "courses.published-options",
  ttlMs: COURSE_CONTENT_TTL_MS,
  maxBytes: 2 * 1024 * 1024,
});

const mediaMaps = new WeakMap<
  CourseContent,
  Map<string, CourseContent["media"][number]>
>();

/** The content's media by id, built once per cached content. */
export function courseMediaById(
  content: CourseContent,
): ReadonlyMap<string, CourseContent["media"][number]> {
  let byId = mediaMaps.get(content);
  if (!byId) {
    byId = new Map(content.media.map((media) => [media.id, media]));
    mediaMaps.set(content, byId);
  }
  return byId;
}
