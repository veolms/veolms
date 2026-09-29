import type {
  CourseListResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";

type RuntimeProcess = typeof globalThis & {
  process?: {
    env?: {
      VEO_PUBLIC_API_BASE_URL?: string;
      VEO_REACT_ROUTER_BUILD?: string;
    };
  };
};

function resolveApiUrl(requestUrl: string, path: string): URL {
  const runtimeEnvironment = (globalThis as RuntimeProcess).process?.env;
  const isStaticBuild = runtimeEnvironment?.VEO_REACT_ROUTER_BUILD === "true";
  const staticBuildBase = isStaticBuild
    ? import.meta.env.STATIC_BUILD_API_URL
    : undefined;
  const configuredBase =
    staticBuildBase ||
    runtimeEnvironment?.VEO_PUBLIC_API_BASE_URL ||
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
    // The public catalogue endpoint returns every published course when no
    // pagination limit is supplied. Keep the static page to one request; the
    // build already uses this endpoint to discover the catalogue's route set.
    return requestPublicData(request, "courses");
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
