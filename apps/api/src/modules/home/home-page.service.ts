import {
  DEFAULT_HOME_PAGE_SETTINGS,
  HOME_PAGE_COURSES_PER_SECTION,
  HOME_PAGE_DISCUSSION_COUNT,
  HOME_PAGE_MAX_HIDDEN_DISCUSSIONS,
  HOME_PAGE_MAX_PINNED_DISCUSSIONS,
  homePageSettingsSchema,
  type CourseSummary,
  type GuestHomePageResponse,
  type HeroVideoPlayback,
  type HomePageCourseSection,
  type HomePageDiscussionListResponse,
  type HomePageLessonVideoOptionsResponse,
  type HomePageOptionsResponse,
  type HomePageSettings,
  type HomePageSettingsResponse,
  type PublicPopularDiscussion,
  type UpdateHomePageDiscussionRequest,
  type VideoPlaybackToken,
} from "@veolms/contracts";
import { cacheTags, createCache } from "@veolms/api-core";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { httpError } from "../../lib/errors.ts";
import type { CourseService } from "../courses/course/course.service.ts";
import type { ThreadsService } from "../learning/discussions/index.ts";
import type { HeroVideoReadyWatch } from "./home-hero-video-ready.ts";
import type { HomeHeroVideoService } from "./home-hero-video.service.ts";
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
 * Every signed-out visit asks for the resolved page, so one build is shared
 * instead of being rebuilt from several queries each time. Saving the
 * settings, or a course or site change, clears it in every process; the TTL
 * covers what is not tracked (popular discussions, enrolment counts).
 */
const guestPages = createCache<GuestHomePageResponse>({
  name: "home.guest-page",
  ttlMs: 30_000,
  maxBytes: 4 * 1024 * 1024,
});
const GUEST_PAGE_KEY = "guest";
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
  getDiscussionList(): Promise<HomePageDiscussionListResponse>;
  /** One change to the home page's comments, saved straight away. */
  updateDiscussion(
    threadId: string,
    action: UpdateHomePageDiscussionRequest["action"],
    updatedBy: string | null,
  ): Promise<HomePageDiscussionListResponse>;
  getGuestPage(): Promise<GuestHomePageResponse>;
  /** The lessons of a course an admin can pick as the hero video. */
  getLessonVideoOptions(
    courseId: string,
  ): Promise<HomePageLessonVideoOptionsResponse>;
  getHeroVideoPlayback(): Promise<HeroVideoPlayback>;
  getHeroVideoPlaybackToken(): Promise<VideoPlaybackToken>;
}

export function createHomePageService({
  database,
  courseService,
  threadsService,
  heroVideoService,
  staticPages,
  heroVideoReadyWatch,
}: {
  database: Kysely<Database>;
  courseService: Pick<CourseService, "listPublicCourseSummaries">;
  threadsService: Pick<ThreadsService, "listPublicPopularDiscussions">;
  heroVideoService: HomeHeroVideoService;
  /** Builds the public home page again; absent where there is none. */
  staticPages?: { requestHomePageRefresh(): void };
  heroVideoReadyWatch?: Pick<HeroVideoReadyWatch, "watch">;
}): HomePageService {
  function toDiscussionList(
    settings: HomePageSettings,
  ): HomePageDiscussionListResponse {
    return {
      pinnedThreadIds: settings.discussions.pinnedThreadIds,
      hiddenThreadIds: settings.discussions.hiddenThreadIds,
    };
  }

  async function writeSettings(
    settings: HomePageSettings,
    updatedBy: string | null,
  ) {
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
    // Other processes are cleared by the site change this save is.
    guestPages.delete(GUEST_PAGE_KEY);
    // The public home page is a static page: it is built again with these
    // settings, and once more when the video chosen for the hero is ready.
    staticPages?.requestHomePageRefresh();
    heroVideoReadyWatch?.watch(
      settings.heroVideo.source === "upload"
        ? settings.heroVideo.mediaId
        : null,
    );
    return row;
  }

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
   * The picture the hero's laptop shows until its video is played: the
   * thumbnail of the lesson's course, or the frame captured from an
   * uploaded video. The rows only list the course on some academies, so it
   * is looked up when neither of them does.
   */
  async function resolveHeroLessonPosterUrl(
    settings: HomePageSettings,
    shownCourses: readonly CourseSummary[],
  ): Promise<string | null> {
    const poster = await heroVideoService.resolvePoster(settings.heroVideo);
    if (!poster) return null;
    if ("url" in poster) return poster.url;

    const { courseId } = poster;
    const shown = shownCourses.find((course) => course.id === courseId);
    if (shown) return heroPosterUrl(shown);

    const [summary] = await courseService.listPublicCourseSummaries({
      courseIds: [courseId],
      limit: 1,
      order: "popular",
    });
    return summary ? heroPosterUrl(summary) : null;
  }

  /**
   * The discussions an admin pinned, read by id: they may be on any
   * published lesson, not only among the most active public ones.
   */
  async function readPinnedDiscussions(
    section: HomePageSettings["discussions"],
  ) {
    if (section.pinnedThreadIds.length === 0) return [];
    const { discussions } = await threadsService.listPublicPopularDiscussions(
      database,
      { threadIds: section.pinnedThreadIds },
    );
    return discussions;
  }

  function resolveDiscussions(
    section: HomePageSettings["discussions"],
    pinnedDiscussions: readonly PublicPopularDiscussion[],
    popular: readonly PublicPopularDiscussion[],
  ) {
    if (!section.visible) return [];
    const hidden = new Set(section.hiddenThreadIds);
    const byId = new Map(pinnedDiscussions.map((item) => [item.id, item]));
    const pinned = section.pinnedThreadIds.flatMap((id) =>
      hidden.has(id) ? [] : (byId.get(id) ?? []),
    );
    const pinnedIds = new Set(pinned.map((item) => item.id));
    // Every pinned discussion shows; the most active ones fill the page up
    // to its usual count when fewer are pinned.
    return [
      ...pinned,
      ...popular.filter(
        (item) => !hidden.has(item.id) && !pinnedIds.has(item.id),
      ),
    ].slice(0, Math.max(HOME_PAGE_DISCUSSION_COUNT, pinned.length));
  }

  async function buildGuestPage(): Promise<GuestHomePageResponse> {
    const { settings, updatedAt } = await readSettings();
    const [popularCourses, pinnedDiscussions, popularDiscussions] =
      await Promise.all([
        resolvePopularCourses(settings.popularCourses),
        settings.discussions.visible
          ? readPinnedDiscussions(settings.discussions)
          : [],
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
    const heroLessonPosterUrl = await resolveHeroLessonPosterUrl(settings, [
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
          pinnedDiscussions,
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
      await heroVideoService.assertSelectable(settings.heroVideo);
      const row = await writeSettings(settings, updatedBy);
      return toResponse({ settings, updatedAt: row.updatedAt });
    },

    async getDiscussionList() {
      return toDiscussionList((await readSettings()).settings);
    },

    async updateDiscussion(threadId, action, updatedBy) {
      const { settings } = await readSettings();
      const section = settings.discussions;
      const without = (ids: readonly string[]) =>
        ids.filter((id) => id !== threadId);
      let pinnedThreadIds = section.pinnedThreadIds;
      let hiddenThreadIds = section.hiddenThreadIds;

      if (action === "add") {
        if (!pinnedThreadIds.includes(threadId)) {
          if (pinnedThreadIds.length >= HOME_PAGE_MAX_PINNED_DISCUSSIONS) {
            throw httpError(
              409,
              "HOME_PAGE_DISCUSSIONS_FULL",
              `The home page lists at most ${HOME_PAGE_MAX_PINNED_DISCUSSIONS} comments. Remove one first.`,
            );
          }
          // The home page reads only public comments on published lessons.
          const { discussions } =
            await threadsService.listPublicPopularDiscussions(database, {
              threadIds: [threadId],
            });
          if (discussions.length === 0) {
            throw httpError(
              409,
              "DISCUSSION_NOT_PUBLIC",
              "Only a public comment or question on a published lesson can be shown on the home page.",
            );
          }
          // Newly added comments come first, where visitors see them.
          pinnedThreadIds = [threadId, ...pinnedThreadIds];
        }
        hiddenThreadIds = without(hiddenThreadIds);
      } else if (action === "remove") {
        pinnedThreadIds = without(pinnedThreadIds);
        hiddenThreadIds = without(hiddenThreadIds);
      } else if (action === "hide") {
        if (
          !hiddenThreadIds.includes(threadId) &&
          hiddenThreadIds.length >= HOME_PAGE_MAX_HIDDEN_DISCUSSIONS
        ) {
          throw httpError(
            409,
            "HOME_PAGE_HIDDEN_DISCUSSIONS_FULL",
            `At most ${HOME_PAGE_MAX_HIDDEN_DISCUSSIONS} comments can be hidden.`,
          );
        }
        hiddenThreadIds = [...without(hiddenThreadIds), threadId];
      } else {
        hiddenThreadIds = without(hiddenThreadIds);
      }

      const next: HomePageSettings = {
        ...settings,
        discussions: { ...section, pinnedThreadIds, hiddenThreadIds },
      };
      await writeSettings(next, updatedBy);
      return toDiscussionList(next);
    },

    async getOptions() {
      const { settings } = await readSettings();
      const [courses, pinned, popular] = await Promise.all([
        courseService.listPublicCourseSummaries({
          limit: COURSE_OPTION_LIMIT,
          order: "popular",
        }),
        // The hidden ones are read too, so the editor can show them again.
        readPinnedDiscussions({
          ...settings.discussions,
          pinnedThreadIds: [
            ...new Set([
              ...settings.discussions.pinnedThreadIds,
              ...settings.discussions.hiddenThreadIds,
            ]),
          ],
        }),
        threadsService.listPublicPopularDiscussions(
          database,
          HOME_DISCUSSION_QUERY,
        ),
      ]);
      // The editor lists the listed and hidden discussions too, the listed
      // ones in their order, whether or not they are among the most active.
      const pinnedById = new Map(pinned.map((item) => [item.id, item]));
      const pinnedInOrder = [
        ...new Set([
          ...settings.discussions.pinnedThreadIds,
          ...settings.discussions.hiddenThreadIds,
        ]),
      ].flatMap((id) => pinnedById.get(id) ?? []);
      return {
        courses: courses.map((course) => ({
          id: course.id,
          title: course.title,
          thumbnailUrl: course.thumbnailUrl ?? null,
          isFree: course.pricing?.pricingType === "free",
        })),
        discussions: [
          ...pinnedInOrder,
          ...popular.discussions.filter((item) => !pinnedById.has(item.id)),
        ],
      };
    },

    async getLessonVideoOptions(courseId) {
      return { lessons: await heroVideoService.listLessonOptions(courseId) };
    },

    async getHeroVideoPlayback() {
      const { settings } = await readSettings();
      return await heroVideoService.getPlayback(settings.heroVideo);
    },

    async getHeroVideoPlaybackToken() {
      const { settings } = await readSettings();
      return await heroVideoService.getPlaybackToken(settings.heroVideo);
    },

    async getGuestPage() {
      // A failed build is not kept.
      return await guestPages.fetch(GUEST_PAGE_KEY, buildGuestPage, {
        tags: [cacheTags.catalog, cacheTags.site],
      });
    },
  };
}
