import {
  DEFAULT_HOME_PAGE_SETTINGS,
  HOME_PAGE_COURSES_PER_SECTION,
  HOME_PAGE_DISCUSSION_COUNT,
  HOME_PAGE_HERO_LESSON,
  homePageSettingsSchema,
  type CourseSummary,
  type GuestHomePageResponse,
  type HomePageCourseSection,
  type HomePageOptionsResponse,
  type HomePageSettings,
  type HomePageSettingsResponse,
  type PublicPopularDiscussion,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { httpError } from "../../lib/errors.ts";
import type { CourseService } from "../courses/course/course.service.ts";
import type { ThreadsService } from "../learning/discussions/index.ts";
import {
  findHomePageSettings,
  isMissingHomePageSettingsTable,
  saveHomePageSettings,
} from "./home-page.repository.ts";

/**
 * The home page shows one comment per student, so no one voice fills it. A few
 * more than it shows are read so hiding some still leaves a full page.
 */
const HOME_DISCUSSION_QUERY = { limit: 40, onePerAuthor: true } as const;
/** How many courses the settings editor offers to choose from. */
const COURSE_OPTION_LIMIT = 200;
/**
 * Every signed-out visit asks for the resolved page, so it is kept briefly
 * instead of being rebuilt from several queries each time. Saving the
 * settings clears it, so an admin sees their own change at once.
 */
const GUEST_PAGE_CACHE_MS = 30_000;
/**
 * The hero's laptop screen is a small part of the picture: about 460 device
 * pixels of thumbnail on a phone, 910 on a high-density laptop, 790 on a
 * 2560px monitor. The full-size thumbnail is three times the download for
 * detail the screen cannot show.
 */
const HERO_POSTER_MIN_WIDTH = 960;

/** The smallest thumbnail that still fills the hero's laptop screen sharply. */
function heroPosterUrl(course: CourseSummary): string | null {
  const fitting = [...(course.thumbnailSrcSet ?? [])]
    .sort((left, right) => left.width - right.width)
    .find((variant) => variant.width >= HERO_POSTER_MIN_WIDTH);
  return fitting?.url ?? course.thumbnailUrl ?? null;
}

interface StoredSettings {
  settings: HomePageSettings;
  updatedAt: Date | null;
}

export interface HomePageService {
  getSettings(): Promise<HomePageSettingsResponse>;
  updateSettings(
    settings: HomePageSettings,
    updatedBy: string | null,
  ): Promise<HomePageSettingsResponse>;
  getOptions(): Promise<HomePageOptionsResponse>;
  getGuestPage(): Promise<GuestHomePageResponse>;
}

export function createHomePageService({
  database,
  courseService,
  threadsService,
}: {
  database: Kysely<Database>;
  courseService: Pick<
    CourseService,
    "listPublicCourseSummaries" | "getPublishedCourseBySlug"
  >;
  threadsService: Pick<ThreadsService, "listPublicPopularDiscussions">;
}): HomePageService {
  let cachedGuestPage:
    { expiresAt: number; page: Promise<GuestHomePageResponse> } | undefined;

  async function readSettings(): Promise<StoredSettings> {
    let row: Awaited<ReturnType<typeof findHomePageSettings>>;
    try {
      row = await findHomePageSettings(database);
    } catch (error) {
      // Until the settings migration has run there is nothing to read; the
      // public home page must keep working on the defaults.
      if (!isMissingHomePageSettingsTable(error)) throw error;
      row = null;
    }
    if (!row) return { settings: DEFAULT_HOME_PAGE_SETTINGS, updatedAt: null };

    // A document saved by an older version of the contract falls back to the
    // defaults rather than breaking the public page.
    const parsed = homePageSettingsSchema.safeParse(row.settings);
    return parsed.success
      ? { settings: parsed.data, updatedAt: row.updatedAt }
      : { settings: DEFAULT_HOME_PAGE_SETTINGS, updatedAt: null };
  }

  function toResponse(stored: StoredSettings): HomePageSettingsResponse {
    return {
      settings: stored.settings,
      updatedAt: stored.updatedAt?.toISOString() ?? null,
    };
  }

  async function selectedCourses(
    section: HomePageCourseSection,
    freeOnly: boolean,
  ): Promise<CourseSummary[] | null> {
    if (section.selection !== "manual") return null;
    return await courseService.listPublicCourseSummaries({
      courseIds: section.courseIds,
      limit: section.courseIds.length,
      order: "popular",
      freeOnly,
    });
  }

  async function resolvePopularCourses(section: HomePageCourseSection) {
    if (!section.visible) return [];
    return (
      (await selectedCourses(section, false)) ??
      (await courseService.listPublicCourseSummaries({
        limit: HOME_PAGE_COURSES_PER_SECTION,
        order: "popular",
      }))
    ).slice(0, HOME_PAGE_COURSES_PER_SECTION);
  }

  async function resolveFreeCourses(
    section: HomePageCourseSection,
    popularCourses: readonly CourseSummary[],
  ) {
    if (!section.visible) return [];
    const selected = await selectedCourses(section, true);
    if (selected) return selected.slice(0, HOME_PAGE_COURSES_PER_SECTION);

    // The automatic row prefers free courses the popular row does not
    // already show, and repeats one only when there are not enough others.
    const shown = new Set(popularCourses.map((course) => course.id));
    const candidates = await courseService.listPublicCourseSummaries({
      limit: HOME_PAGE_COURSES_PER_SECTION * 2,
      order: "popular",
      freeOnly: true,
    });
    return [
      ...candidates.filter((course) => !shown.has(course.id)),
      ...candidates.filter((course) => shown.has(course.id)),
    ].slice(0, HOME_PAGE_COURSES_PER_SECTION);
  }

  /**
   * The picture the hero's laptop shows until its lesson is played: that
   * lesson's course thumbnail. The rows only list the course on some
   * academies, so it is looked up when neither of them does.
   */
  async function resolveHeroLessonPosterUrl(
    shownCourses: readonly CourseSummary[],
  ): Promise<string | null> {
    const { courseSlug } = HOME_PAGE_HERO_LESSON;
    const shown = shownCourses.find((course) => course.slug === courseSlug);
    if (shown) return heroPosterUrl(shown);

    const course = await courseService.getPublishedCourseBySlug(courseSlug);
    if (!course) return null;
    const [summary] = await courseService.listPublicCourseSummaries({
      courseIds: [course.id],
      limit: 1,
      order: "popular",
    });
    return summary ? heroPosterUrl(summary) : null;
  }

  function resolveDiscussions(
    section: HomePageSettings["discussions"],
    popular: readonly PublicPopularDiscussion[],
  ) {
    if (!section.visible) return [];
    const hidden = new Set(section.hiddenThreadIds);
    const visible = popular.filter((discussion) => !hidden.has(discussion.id));
    const byId = new Map(visible.map((item) => [item.id, item]));
    const pinned = section.pinnedThreadIds.flatMap((id) => byId.get(id) ?? []);
    const pinnedIds = new Set(pinned.map((item) => item.id));
    return [
      ...pinned,
      ...visible.filter((item) => !pinnedIds.has(item.id)),
    ].slice(0, HOME_PAGE_DISCUSSION_COUNT);
  }

  async function buildGuestPage(): Promise<GuestHomePageResponse> {
    const { settings, updatedAt } = await readSettings();
    const [popularCourses, popularDiscussions] = await Promise.all([
      resolvePopularCourses(settings.popularCourses),
      settings.discussions.visible
        ? threadsService.listPublicPopularDiscussions(
            database,
            HOME_DISCUSSION_QUERY,
          )
        : { discussions: [] },
    ]);
    const freeCourses = await resolveFreeCourses(
      settings.freeCourses,
      popularCourses,
    );
    const heroLessonPosterUrl = await resolveHeroLessonPosterUrl([
      ...popularCourses,
      ...freeCourses,
    ]);

    return {
      version: updatedAt?.toISOString() ?? "default",
      hero: settings.hero,
      heroLessonPosterUrl,
      highlights: settings.highlights,
      popularCourses: {
        visible: settings.popularCourses.visible,
        title: settings.popularCourses.title,
        subtitle: settings.popularCourses.subtitle,
        courses: popularCourses,
      },
      freeCourses: {
        visible: settings.freeCourses.visible,
        title: settings.freeCourses.title,
        subtitle: settings.freeCourses.subtitle,
        courses: freeCourses,
      },
      discussions: {
        visible: settings.discussions.visible,
        title: settings.discussions.title,
        items: resolveDiscussions(
          settings.discussions,
          popularDiscussions.discussions,
        ),
      },
    };
  }

  return {
    async getSettings() {
      return toResponse(await readSettings());
    },

    async updateSettings(settings, updatedBy) {
      let row: Awaited<ReturnType<typeof saveHomePageSettings>>;
      try {
        row = await saveHomePageSettings(database, { settings, updatedBy });
      } catch (error) {
        if (!isMissingHomePageSettingsTable(error)) throw error;
        throw httpError(
          503,
          "HOME_PAGE_SETTINGS_UNAVAILABLE",
          "Home page settings cannot be saved until the database migration that creates them has been run.",
        );
      }
      cachedGuestPage = undefined;
      return toResponse({ settings, updatedAt: row.updatedAt });
    },

    async getOptions() {
      const [courses, popular] = await Promise.all([
        courseService.listPublicCourseSummaries({
          limit: COURSE_OPTION_LIMIT,
          order: "popular",
        }),
        threadsService.listPublicPopularDiscussions(
          database,
          HOME_DISCUSSION_QUERY,
        ),
      ]);
      return {
        courses: courses.map((course) => ({
          id: course.id,
          title: course.title,
          thumbnailUrl: course.thumbnailUrl ?? null,
          isFree: course.pricing?.pricingType === "free",
        })),
        discussions: popular.discussions,
      };
    },

    async getGuestPage() {
      const now = Date.now();
      if (cachedGuestPage && cachedGuestPage.expiresAt > now) {
        return await cachedGuestPage.page;
      }
      const entry = {
        expiresAt: now + GUEST_PAGE_CACHE_MS,
        page: buildGuestPage(),
      };
      cachedGuestPage = entry;
      try {
        return await entry.page;
      } catch (error) {
        // A failed build must not be served again from the cache.
        if (cachedGuestPage === entry) cachedGuestPage = undefined;
        throw error;
      }
    },
  };
}
