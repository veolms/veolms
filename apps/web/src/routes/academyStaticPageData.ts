import {
  courseAccessResponseSchema,
  courseListResponseSchema,
  coursePublicCurriculumSchema,
  guestHomePageResponseSchema,
  homeDiscoveryResponseSchema,
  lessonDiscussionsListResponseSchema,
  publicPopularDiscussionsResponseSchema,
  type CourseListResponse,
  type CoursePublicCurriculum,
  type GuestHomePageResponse,
  type HomeDiscoveryResponse,
} from "@veolms/contracts";
import { DEFAULT_HOME_PAGE_SETTINGS } from "@veolms/contracts/home-page-defaults";
import {
  GUEST_HOME_DISCUSSION_COUNT,
  selectGuestHomeCourses,
} from "../home/guestHomeLimits";
import { fetchStaticBuildApi } from "./staticBuildApi";
import {
  toCurriculumPreview,
  type CourseCurriculumPreview,
} from "../courses/staticCurriculum";
import { resolveLessonIdentifier } from "../learning/courseContent";
import {
  DISCUSSIONS_IN_LESSON_PAGE,
  findCurriculumLesson,
  openingDiscussionKind,
  toLessonPageSeed,
  type LessonPageSeed,
} from "../learning/staticLessonPage";

export interface AcademyStaticPageData {
  publishedCoursePage?: CourseListResponse;
  publishedCoursePageNeedsRefresh?: boolean;
  /**
   * A course page's course, as every visitor sees it: its first sections
   * only (the rest is a file of its own), with the price at build time.
   */
  courseCurriculum?: CourseCurriculumPreview;
  /**
   * A lesson page's lesson, as every visitor sees it: the course with its
   * section headings, the lesson's own section, its first discussions.
   */
  lessonPage?: LessonPageSeed;
  guestHomePage?: GuestHomePageResponse;
  /**
   * The home page's words without its courses and discussions, carried by
   * every other page so that opening the home page from there shows its copy
   * at once; only the course rows are then still to load.
   */
  guestHomeCopy?: GuestHomePageResponse;
}

function toGuestHomeCopy(page: GuestHomePageResponse): GuestHomePageResponse {
  return {
    ...page,
    popularCourses: { ...page.popularCourses, courses: [] },
    freeCourses: { ...page.freeCourses, courses: [] },
    discussions: { ...page.discussions, items: [] },
  };
}

const PUBLISHED_COURSE_PAGE_SIZE = 24;

let publishedCoursePagePromise:
  | Promise<{
      page: CourseListResponse;
      needsRefresh: boolean;
    }>
  | undefined;

function getStaticApiBaseUrl() {
  const configured =
    import.meta.env.STATIC_BUILD_API_URL || "http://127.0.0.1:4000/v1";
  const normalized = configured
    .replace(/\/+$/u, "")
    .replace(/\/api\/v1$/u, "/v1");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

// Stay inside the 10 second limit React Router gives each prerender request.
const STATIC_API_RETRY_BUDGET_MS = 7_000;

async function fetchStaticApiData<T>(
  path: string,
  parse: (value: unknown) => T,
  retryBudgetMs = STATIC_API_RETRY_BUDGET_MS,
) {
  const response = await fetchStaticBuildApi(
    `${getStaticApiBaseUrl()}${path}`,
    retryBudgetMs,
  );
  if (!response.ok) {
    throw new Error(
      `Static course data request failed (${response.status}): ${path}`,
    );
  }
  const body: unknown = await response.json();
  const payload =
    body && typeof body === "object" && "success" in body && "data" in body
      ? body.data
      : body;
  return parse(payload);
}

let guestHomePagePromise: Promise<GuestHomePageResponse> | undefined;

/**
 * The home page an API that predates the configurable home page can still
 * supply: the default copy around its discovery courses and discussions. A
 * web build can run before the API it talks to has been updated.
 */
async function loadDefaultGuestHomePage(): Promise<GuestHomePageResponse> {
  const [courses, discussions] = await Promise.all([
    fetchStaticApiData("/home/discovery", (value) => {
      const result = homeDiscoveryResponseSchema.safeParse(value);
      if (!result.success) {
        throw new Error(
          "The build API returned invalid home discovery sections.",
        );
      }
      return selectGuestHomeCourses(result.data as HomeDiscoveryResponse);
    }),
    fetchStaticApiData("/discussions/popular", (value) => {
      const result = publicPopularDiscussionsResponseSchema.safeParse(value);
      if (!result.success) {
        throw new Error("The build API returned invalid popular discussions.");
      }
      return result.data.discussions.slice(0, GUEST_HOME_DISCUSSION_COUNT);
    }).catch(() => []),
  ]);
  const {
    hero,
    highlights,
    popularCourses,
    freeCourses,
    discussions: rail,
  } = DEFAULT_HOME_PAGE_SETTINGS;
  return {
    version: "build-default",
    hero,
    highlights,
    popularCourses: {
      visible: popularCourses.visible,
      title: popularCourses.title,
      subtitle: popularCourses.subtitle,
      courses: courses.popularCourses,
    },
    freeCourses: {
      visible: freeCourses.visible,
      title: freeCourses.title,
      subtitle: freeCourses.subtitle,
      courses: courses.freeCourses,
    },
    discussions: {
      visible: rail.visible,
      title: rail.title,
      items: discussions,
    },
  };
}

function loadGuestHomePage() {
  guestHomePagePromise ??= fetchStaticApiData("/home/guest-page", (value) => {
    const result = guestHomePageResponseSchema.safeParse(value);
    if (!result.success) {
      throw new Error("The build API returned an invalid guest home page.");
    }
    const page = result.data as GuestHomePageResponse;
    // Only the first page of comments is built into the page.
    return {
      ...page,
      discussions: {
        ...page.discussions,
        items: page.discussions.items.slice(0, GUEST_HOME_DISCUSSION_COUNT),
      },
    };
  }).catch((error: unknown) => {
    console.warn(
      "The configured guest home page was not available; prerendering the default one:",
      error instanceof Error ? error.message : error,
    );
    return loadDefaultGuestHomePage();
  });
  return guestHomePagePromise;
}

function loadPublishedCourses() {
  publishedCoursePagePromise ??= fetchStaticApiData(
    "/courses?limit=24&sort=latest",
    (value) => {
      const result = courseListResponseSchema.safeParse(value);
      if (!result.success) {
        throw new Error(
          "The build API returned an invalid published course catalogue.",
        );
      }
      const needsRefresh =
        !result.data.nextCursor &&
        result.data.courses.length > PUBLISHED_COURSE_PAGE_SIZE;
      return {
        page: {
          ...result.data,
          courses: result.data.courses.slice(0, PUBLISHED_COURSE_PAGE_SIZE),
        },
        needsRefresh,
      };
    },
  );
  return publishedCoursePagePromise;
}

let developmentGuestHomePage: GuestHomePageResponse | undefined;
let developmentGuestHomePageRefresh: Promise<void> | undefined;

function refreshDevelopmentGuestHomePage() {
  developmentGuestHomePageRefresh ??= fetchStaticApiData(
    "/home/guest-page",
    (value) => {
      const result = guestHomePageResponseSchema.safeParse(value);
      if (!result.success) {
        throw new Error("The API returned an invalid guest home page.");
      }
      return result.data as GuestHomePageResponse;
    },
    0,
  )
    .then((page) => {
      developmentGuestHomePage = page;
    })
    // When the API is not up the page loads itself in the browser as before.
    .catch(() => undefined)
    .finally(() => {
      developmentGuestHomePageRefresh = undefined;
    });
  return developmentGuestHomePageRefresh;
}

/**
 * The dev server does not prerender, so its home page would wait for a
 * request made after the app has started and show placeholders meanwhile.
 * Handing the page to the document instead lets the first render already
 * hold the configured copy, as the production build does.
 *
 * The document must not wait for the API on every load, so the last page
 * read is served at once and refreshed behind it; only the first load after
 * the dev server starts waits. The browser checks the page against the
 * current settings once it is idle, which corrects a copy that is one load
 * behind.
 */
export async function loadDevelopmentHomePageData(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/[/]$/u, "") || "/";
  const refresh = refreshDevelopmentGuestHomePage();
  const courseSlug = readCourseOverviewSlug(pathname);
  const lessonAddress = readLessonPageAddress(pathname);
  const [courseCurriculum, lessonPage] = await Promise.all([
    courseSlug ? loadDevelopmentCourseOverview(courseSlug) : undefined,
    lessonAddress ? loadDevelopmentLessonPage(lessonAddress) : undefined,
    developmentGuestHomePage ? undefined : refresh,
  ]);
  const coursePageData = {
    ...(courseCurriculum ? { courseCurriculum } : {}),
    ...(lessonPage ? { lessonPage } : {}),
  } satisfies AcademyStaticPageData;
  if (!developmentGuestHomePage) {
    return courseCurriculum || lessonPage ? coursePageData : null;
  }
  return (
    pathname === "/" || pathname === "/home"
      ? { guestHomePage: developmentGuestHomePage }
      : {
          guestHomeCopy: toGuestHomeCopy(developmentGuestHomePage),
          ...coursePageData,
        }
  ) satisfies AcademyStaticPageData;
}

/** The course a course page's address is for; nothing for any other address. */
function readCourseOverviewSlug(pathname: string) {
  const match = /^\/courses\/([^/]+)\/overview$/u.exec(pathname);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function parseWith<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  what: string,
) {
  return (value: unknown) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new Error(`The build API returned invalid ${what}.`);
    }
    return result.data as T;
  };
}

/** The address of a lesson page: its course and lesson number. */
function readLessonPageAddress(pathname: string) {
  const match = /^\/learn\/([^/]+)\/([^/]+)$/u.exec(pathname);
  if (!match?.[1] || !match[2]) return undefined;
  const lessonNumber = resolveLessonIdentifier(match[2]);
  if (lessonNumber === null) return undefined;
  try {
    return { courseSlug: decodeURIComponent(match[1]), lessonNumber };
  } catch {
    return undefined;
  }
}

function fetchPublicCurriculum(courseSlug: string, retryBudgetMs?: number) {
  return fetchStaticApiData(
    `/courses/${encodeURIComponent(courseSlug)}/curriculum`,
    parseWith(
      coursePublicCurriculumSchema,
      `public curriculum for ${courseSlug}`,
    ),
    retryBudgetMs,
  );
}

/**
 * Each course's public curriculum, read once per build: a course's course
 * page and all of its lesson pages are built from the same copy, so they
 * agree with each other and with the course's curriculum file.
 */
const builtPublicCurricula = new Map<string, Promise<CoursePublicCurriculum>>();

function loadBuiltPublicCurriculum(courseSlug: string) {
  let curriculum = builtPublicCurricula.get(courseSlug);
  if (!curriculum) {
    curriculum = fetchPublicCurriculum(courseSlug);
    // A failed read is tried again by the next page that needs it.
    curriculum.catch(() => builtPublicCurricula.delete(courseSlug));
    builtPublicCurricula.set(courseSlug, curriculum);
  }
  return curriculum;
}

/**
 * A lesson page's lesson from its course's public curriculum, with the
 * first of its discussions as a visitor is shown them. A lesson whose
 * discussions cannot be read is built without them; the page then loads
 * them as before.
 */
async function loadLessonPageSeed(
  curriculum: CoursePublicCurriculum,
  lessonNumber: number,
  retryBudgetMs?: number,
): Promise<LessonPageSeed | undefined> {
  const lesson = findCurriculumLesson(curriculum, lessonNumber);
  if (!lesson) return undefined;
  const kind = openingDiscussionKind(curriculum.settings);
  const page = kind
    ? await fetchStaticApiData(
        `/courses/${curriculum.course.id}/lessons/${lesson.id}/discussions?${new URLSearchParams(
          {
            kind,
            sort: "top",
            limit: String(DISCUSSIONS_IN_LESSON_PAGE),
          },
        )}`,
        parseWith(
          lessonDiscussionsListResponseSchema,
          `discussions for ${curriculum.course.slug} lesson ${lessonNumber}`,
        ),
        retryBudgetMs,
      ).catch((error: unknown) => {
        console.warn(
          "Building a lesson page without its discussions:",
          error instanceof Error ? error.message : error,
        );
        return null;
      })
    : null;
  return toLessonPageSeed(
    curriculum,
    lessonNumber,
    kind && page ? { kind, page } : null,
    Date.now(),
  );
}

/**
 * A course page's course: its public curriculum, the same for everyone,
 * and whether it is paid (asked without a session, so it is the course's,
 * not anyone's access). Not its price, which the page asks for itself.
 */
async function loadCourseCurriculumPreview(
  courseSlug: string,
  retryBudgetMs?: number,
): Promise<CourseCurriculumPreview> {
  const key = encodeURIComponent(courseSlug);
  const [curriculum, access] = await Promise.all([
    retryBudgetMs === undefined
      ? loadBuiltPublicCurriculum(courseSlug)
      : fetchPublicCurriculum(courseSlug, retryBudgetMs),
    fetchStaticApiData(
      `/courses/${key}/access`,
      parseWith(courseAccessResponseSchema, `access for ${courseSlug}`),
      retryBudgetMs,
    ),
  ]);
  return toCurriculumPreview(curriculum, access.pricing.pricingType);
}

/** The last course read for each course page the dev server has served. */
const developmentCourseOverviews = new Map<string, CourseCurriculumPreview>();
const developmentCourseOverviewRefreshes = new Map<string, Promise<void>>();
/** A handful of pages are open in development; this only stops it growing. */
const DEVELOPMENT_COURSE_OVERVIEW_LIMIT = 50;

/**
 * A course page on the dev server, as the production build has it: the
 * course is handed to the document, so the first render already holds the
 * title, the first sections of the curriculum and the About text, and only
 * the parts that depend
 * on the viewer wait (see `courseViewerState`). Without this the dev
 * server's course page was one whole placeholder until its own request
 * answered, which is not what a visitor of the built site sees.
 *
 * It is the course as every visitor sees it, as the build's is: no session
 * goes with it. As with the home page, the last one read is served at once
 * and refreshed behind it, so only the first load of a course waits for the
 * API; the viewer's access answer says when the page is behind the course.
 */
async function loadDevelopmentCourseOverview(courseSlug: string) {
  let refresh = developmentCourseOverviewRefreshes.get(courseSlug);
  if (!refresh) {
    refresh = loadCourseCurriculumPreview(courseSlug, 0)
      .then((preview) => {
        developmentCourseOverviews.delete(courseSlug);
        developmentCourseOverviews.set(courseSlug, preview);
        if (
          developmentCourseOverviews.size > DEVELOPMENT_COURSE_OVERVIEW_LIMIT
        ) {
          const oldest = developmentCourseOverviews.keys().next().value;
          if (oldest !== undefined) developmentCourseOverviews.delete(oldest);
        }
      })
      // A course that is not there, or an API that is not up: the page asks
      // for it in the browser as before, and says what it finds.
      .catch(() => {
        developmentCourseOverviews.delete(courseSlug);
      })
      .finally(() => {
        developmentCourseOverviewRefreshes.delete(courseSlug);
      });
    developmentCourseOverviewRefreshes.set(courseSlug, refresh);
  }
  if (!developmentCourseOverviews.has(courseSlug)) await refresh;
  return developmentCourseOverviews.get(courseSlug);
}

/** The last public curriculum read for each course the dev server has served lessons of. */
const developmentCurricula = new Map<string, CoursePublicCurriculum>();
const developmentCurriculumRefreshes = new Map<string, Promise<void>>();

/**
 * A lesson page on the dev server, as the production build has it, but
 * for its discussions, which the page loads itself (the document does not
 * wait on a request for every lesson). The course's curriculum is served
 * from the last copy read and refreshed behind it, as the course page's is.
 */
async function loadDevelopmentLessonPage({
  courseSlug,
  lessonNumber,
}: {
  courseSlug: string;
  lessonNumber: number;
}) {
  let refresh = developmentCurriculumRefreshes.get(courseSlug);
  if (!refresh) {
    refresh = fetchPublicCurriculum(courseSlug, 0)
      .then((curriculum) => {
        developmentCurricula.delete(courseSlug);
        developmentCurricula.set(courseSlug, curriculum);
        if (developmentCurricula.size > DEVELOPMENT_COURSE_OVERVIEW_LIMIT) {
          const oldest = developmentCurricula.keys().next().value;
          if (oldest !== undefined) developmentCurricula.delete(oldest);
        }
      })
      .catch(() => {
        developmentCurricula.delete(courseSlug);
      })
      .finally(() => {
        developmentCurriculumRefreshes.delete(courseSlug);
      });
    developmentCurriculumRefreshes.set(courseSlug, refresh);
  }
  if (!developmentCurricula.has(courseSlug)) await refresh;
  const curriculum = developmentCurricula.get(courseSlug);
  return curriculum
    ? toLessonPageSeed(curriculum, lessonNumber, null, Date.now())
    : undefined;
}

export async function loadAcademyStaticPageData(
  request: Request,
  courseSlug?: string,
): Promise<AcademyStaticPageData | null> {
  if (process.env.VEO_REACT_ROUTER_BUILD !== "true") return null;
  const pageData = await loadStaticPageData(request, courseSlug);
  if (pageData?.guestHomePage) return pageData;
  // Secondary to the page being built: without it the home page loads its
  // copy in the browser when it is opened from this page.
  const guestHomeCopy = await loadGuestHomePage()
    .then(toGuestHomeCopy)
    .catch(() => undefined);
  return guestHomeCopy ? { ...pageData, guestHomeCopy } : pageData;
}

async function loadStaticPageData(
  request: Request,
  courseSlug?: string,
): Promise<AcademyStaticPageData | null> {
  const pathname =
    new URL(request.url).pathname
      .replace(/(?:_)?\.data$/u, "")
      .replace(/\/$/u, "") || "/";
  if (pathname === "/" || pathname === "/courses") {
    const [publishedCourses, guestHomePage] = await Promise.all([
      loadPublishedCourses(),
      // The guest home is rendered entirely from this build-time data, so
      // it is prerendered whole; the browser only checks it for changes.
      pathname === "/" ? loadGuestHomePage() : undefined,
    ]);
    return {
      publishedCoursePage: publishedCourses.page,
      publishedCoursePageNeedsRefresh: publishedCourses.needsRefresh,
      ...(guestHomePage ? { guestHomePage } : {}),
    } satisfies AcademyStaticPageData;
  }
  if (pathname.startsWith("/courses/") && pathname.endsWith("/overview")) {
    if (!courseSlug) return null;
    return {
      courseCurriculum: await loadCourseCurriculumPreview(courseSlug),
    } satisfies AcademyStaticPageData;
  }
  const lessonAddress = readLessonPageAddress(pathname);
  if (lessonAddress) {
    const lessonPage = await loadBuiltLessonPageSeed(lessonAddress);
    return lessonPage ? ({ lessonPage } satisfies AcademyStaticPageData) : null;
  }
  return null;
}

/**
 * Each lesson page's seed, read once per build. A page's data is fetched
 * for its `.data` file and, being larger than React Router hands to the
 * HTML render, read again for its HTML; this keeps that to one read of its
 * discussions, and the two files the same.
 */
const builtLessonPageSeeds = new Map<
  string,
  Promise<LessonPageSeed | undefined>
>();

function loadBuiltLessonPageSeed({
  courseSlug,
  lessonNumber,
}: {
  courseSlug: string;
  lessonNumber: number;
}) {
  const key = `${courseSlug}/${lessonNumber}`;
  let seed = builtLessonPageSeeds.get(key);
  if (!seed) {
    seed = loadBuiltPublicCurriculum(courseSlug).then((curriculum) =>
      loadLessonPageSeed(curriculum, lessonNumber),
    );
    seed.catch(() => builtLessonPageSeeds.delete(key));
    builtLessonPageSeeds.set(key, seed);
  }
  return seed;
}
