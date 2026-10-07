import {
  courseListResponseSchema,
  courseOverviewSchema,
  guestHomePageResponseSchema,
  homeDiscoveryResponseSchema,
  publicPopularDiscussionsResponseSchema,
  type CourseListResponse,
  type CourseOverviewResponse,
  type GuestHomePageResponse,
  type HomeDiscoveryResponse,
} from "@veolms/contracts";
import { DEFAULT_HOME_PAGE_SETTINGS } from "@veolms/contracts/home-page-defaults";
import {
  GUEST_HOME_DISCUSSION_COUNT,
  selectGuestHomeCourses,
} from "../home/guestHomeLimits";
import { fetchStaticBuildApi } from "./staticBuildApi";

export interface AcademyStaticPageData {
  publishedCoursePage?: CourseListResponse;
  publishedCoursePageNeedsRefresh?: boolean;
  courseOverview?: CourseOverviewResponse;
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
  if (!developmentGuestHomePage) await refresh;
  if (!developmentGuestHomePage) return null;
  return (
    pathname === "/" || pathname === "/home"
      ? { guestHomePage: developmentGuestHomePage }
      : { guestHomeCopy: toGuestHomeCopy(developmentGuestHomePage) }
  ) satisfies AcademyStaticPageData;
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
      courseOverview: await fetchStaticApiData(
        `/courses/${encodeURIComponent(courseSlug)}/overview`,
        (value) => {
          const result = courseOverviewSchema.safeParse(value);
          if (!result.success) {
            throw new Error(
              `The build API returned invalid overview data for ${courseSlug}.`,
            );
          }
          return result.data as CourseOverviewResponse;
        },
      ),
    } satisfies AcademyStaticPageData;
  }
  return null;
}
