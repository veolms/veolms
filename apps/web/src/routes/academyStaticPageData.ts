import {
  courseListResponseSchema,
  courseOverviewSchema,
  homeDiscoveryResponseSchema,
  publicPopularDiscussionsResponseSchema,
  type CourseListResponse,
  type CourseOverviewResponse,
  type HomeDiscoveryResponse,
  type PublicPopularDiscussion,
} from "@veolms/contracts";
import {
  GUEST_HOME_COURSES_PER_SECTION,
  GUEST_HOME_DISCUSSION_COUNT,
} from "../home/guestHomeLimits";
import { fetchStaticBuildApi } from "./staticBuildApi";

export interface AcademyStaticPageData {
  publishedCoursePage?: CourseListResponse;
  publishedCoursePageNeedsRefresh?: boolean;
  courseOverview?: CourseOverviewResponse;
  homeDiscovery?: HomeDiscoveryResponse;
  homePopularDiscussions?: PublicPopularDiscussion[];
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
) {
  const response = await fetchStaticBuildApi(
    `${getStaticApiBaseUrl()}${path}`,
    STATIC_API_RETRY_BUDGET_MS,
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

let homeDiscoveryPromise: Promise<HomeDiscoveryResponse> | undefined;

function loadHomeDiscovery() {
  homeDiscoveryPromise ??= fetchStaticApiData("/home/discovery", (value) => {
    const result = homeDiscoveryResponseSchema.safeParse(value);
    if (!result.success) {
      throw new Error(
        "The build API returned invalid home discovery sections.",
      );
    }
    // The guest home shows a fixed number of courses per section, so only
    // those are serialized into the prerendered document.
    const discovery = result.data as HomeDiscoveryResponse;
    return {
      ...discovery,
      popularCourses: discovery.popularCourses.slice(
        0,
        GUEST_HOME_COURSES_PER_SECTION,
      ),
      freeCourses: discovery.freeCourses.slice(
        0,
        GUEST_HOME_COURSES_PER_SECTION,
      ),
      recentCourses: discovery.recentCourses.slice(
        0,
        GUEST_HOME_COURSES_PER_SECTION,
      ),
    };
  });
  return homeDiscoveryPromise;
}

let homePopularDiscussionsPromise:
  Promise<PublicPopularDiscussion[] | undefined> | undefined;

function loadHomePopularDiscussions() {
  homePopularDiscussionsPromise ??= fetchStaticApiData(
    "/discussions/popular",
    (value) => {
      const result = publicPopularDiscussionsResponseSchema.safeParse(value);
      if (!result.success) {
        throw new Error("The build API returned invalid popular discussions.");
      }
      return result.data.discussions.slice(0, GUEST_HOME_DISCUSSION_COUNT);
    },
  ).catch((error: unknown) => {
    // The panel is secondary content: without build-time data the guest home
    // falls back to loading it in the browser instead of failing the build.
    console.warn(
      "Guest home popular discussions were not prerendered:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  });
  return homePopularDiscussionsPromise;
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

export async function loadAcademyStaticPageData(
  request: Request,
  courseSlug?: string,
) {
  if (process.env.VEO_REACT_ROUTER_BUILD !== "true") return null;
  const pathname =
    new URL(request.url).pathname
      .replace(/(?:_)?\.data$/u, "")
      .replace(/\/$/u, "") || "/";
  if (pathname === "/" || pathname === "/courses") {
    const [publishedCourses, homeDiscovery, homePopularDiscussions] =
      await Promise.all([
        loadPublishedCourses(),
        // The guest home is rendered entirely from this build-time data, so
        // it is prerendered whole and needs no API request in the browser.
        pathname === "/" ? loadHomeDiscovery() : undefined,
        pathname === "/" ? loadHomePopularDiscussions() : undefined,
      ]);
    return {
      publishedCoursePage: publishedCourses.page,
      publishedCoursePageNeedsRefresh: publishedCourses.needsRefresh,
      ...(homeDiscovery ? { homeDiscovery } : {}),
      ...(homePopularDiscussions ? { homePopularDiscussions } : {}),
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
