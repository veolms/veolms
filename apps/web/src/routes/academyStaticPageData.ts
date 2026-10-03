import {
  courseListResponseSchema,
  courseOverviewSchema,
  type CourseListResponse,
  type CourseOverviewResponse,
} from "@veolms/contracts";

export interface AcademyStaticPageData {
  publishedCoursePage?: CourseListResponse;
  publishedCoursePageNeedsRefresh?: boolean;
  courseOverview?: CourseOverviewResponse;
}

const PUBLISHED_COURSE_PAGE_SIZE = 24;

let publishedCoursePagePromise:
  | Promise<{
      page: CourseListResponse;
      needsRefresh: boolean;
    }>
  | undefined;

function getStaticApiBaseUrl() {
  const configured = import.meta.env.STATIC_BUILD_API_URL || "http://127.0.0.1:4000/v1";
  const normalized = configured.replace(/\/+$/u, "").replace(/\/api\/v1$/u, "/v1");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

async function fetchStaticApiData<T>(path: string, parse: (value: unknown) => T) {
  const response = await fetch(`${getStaticApiBaseUrl()}${path}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Static course data request failed (${response.status}): ${path}`);
  }
  const body: unknown = await response.json();
  const payload =
    body && typeof body === "object" && "success" in body && "data" in body ? body.data : body;
  return parse(payload);
}

function loadPublishedCourses() {
  publishedCoursePagePromise ??= fetchStaticApiData("/courses?limit=24&sort=latest", (value) => {
    const result = courseListResponseSchema.safeParse(value);
    if (!result.success) {
      throw new Error("The build API returned an invalid published course catalogue.");
    }
    const needsRefresh =
      !result.data.nextCursor && result.data.courses.length > PUBLISHED_COURSE_PAGE_SIZE;
    return {
      page: {
        ...result.data,
        courses: result.data.courses.slice(0, PUBLISHED_COURSE_PAGE_SIZE),
      },
      needsRefresh,
    };
  });
  return publishedCoursePagePromise;
}

export async function loadAcademyStaticPageData(request: Request, courseSlug?: string) {
  if (process.env.VEO_REACT_ROUTER_BUILD !== "true") return null;
  const pathname =
    new URL(request.url).pathname.replace(/(?:_)?\.data$/u, "").replace(/\/$/u, "") || "/";
  if (pathname === "/" || pathname === "/courses") {
    const publishedCourses = await loadPublishedCourses();
    return {
      publishedCoursePage: publishedCourses.page,
      publishedCoursePageNeedsRefresh: publishedCourses.needsRefresh,
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
            throw new Error(`The build API returned invalid overview data for ${courseSlug}.`);
          }
          return result.data as CourseOverviewResponse;
        },
      ),
    } satisfies AcademyStaticPageData;
  }
  return null;
}
