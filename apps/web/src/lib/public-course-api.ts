import type {
  CourseListResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";

type RuntimeProcess = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function resolveApiUrl(requestUrl: string, path: string): URL {
  const runtimeEnv = (globalThis as RuntimeProcess).process?.env;
  const isStaticBuild = runtimeEnv?.VEO_REACT_ROUTER_BUILD === "true";
  // Prerendered page data must come from the same API as the discovered paths.
  const staticBuildBase = import.meta.env.STATIC_BUILD_API_URL;
  const normalizedStaticBuildBase = staticBuildBase
    ? staticBuildBase.replace(/\/+$/u, "").replace(/\/api\/v1$/u, "/v1")
    : undefined;
  const configuredBase =
    (isStaticBuild && normalizedStaticBuildBase
      ? normalizedStaticBuildBase.endsWith("/v1")
        ? normalizedStaticBuildBase
        : `${normalizedStaticBuildBase}/v1`
      : undefined) ||
    runtimeEnv?.VEO_PUBLIC_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "/v1";
  const normalizedBase = configuredBase.endsWith("/")
    ? configuredBase
    : `${configuredBase}/`;
  return new URL(path.replace(/^\/+/, ""), new URL(normalizedBase, requestUrl));
}

async function requestPublicData<T>(
  request: Request,
  path: string,
): Promise<T> {
  const response = await fetch(resolveApiUrl(request.url, path), {
    headers: { Accept: "application/json" },
    signal: request.signal,
  });
  if (!response.ok) {
    throw new Response("Unable to load public course data.", {
      status: response.status,
      statusText: response.statusText,
    });
  }
  const payload: unknown = await response.json();
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
  ) {
    return payload.data as T;
  }
  return payload as T;
}

export const publicCourseApi = {
  async list(request: Request): Promise<CourseListResponse> {
    const courses: CourseListResponse["courses"] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const page = await requestPublicData<CourseListResponse>(
        request,
        `courses?${query.toString()}`,
      );
      courses.push(...page.courses);
      cursor = page.nextCursor;
    } while (cursor);
    return { courses };
  },
  overview(
    request: Request,
    courseSlug: string,
  ): Promise<CourseOverviewResponse> {
    return requestPublicData(
      request,
      `courses/${encodeURIComponent(courseSlug)}/overview`,
    );
  },
};
