import type {
  CourseListResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";

type RuntimeProcess = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function resolveApiUrl(requestUrl: string, path: string): URL {
  const runtimeBase = (globalThis as RuntimeProcess).process?.env
    ?.VEO_PUBLIC_API_BASE_URL;
  const configuredBase = (
    runtimeBase ||
    import.meta.env.VITE_API_BASE_URL ||
    "/v1"
  ).replace(/\/api(?=\/v1\/?$)/u, "");
  const normalizedBase = configuredBase.endsWith("/")
    ? configuredBase
    : `${configuredBase}/`;
  return new URL(path.replace(/^\/+/, ""), new URL(normalizedBase, requestUrl));
}

export function isBuildPrerenderRequest(): boolean {
  const runtimeEnv = (globalThis as RuntimeProcess).process?.env;
  return Boolean(
    runtimeEnv?.IS_RR_BUILD_REQUEST === "yes" ||
    Boolean(runtimeEnv?.VEO_BUILD_DIRECTORY),
  );
}

export function isBuildPrerenderWithoutPublicApi(): boolean {
  const runtimeEnv = (globalThis as RuntimeProcess).process?.env;
  // Browser API config does not opt build-time prerenders into public API I/O.
  // Only the explicit server-side public API override enables these requests.
  return isBuildPrerenderRequest() && !runtimeEnv?.VEO_PUBLIC_API_BASE_URL;
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
  list(request: Request): Promise<CourseListResponse> {
    if (isBuildPrerenderWithoutPublicApi()) {
      return Promise.resolve({ courses: [], nextCursor: null });
    }
    return requestPublicData(request, "courses?limit=50");
  },

  overview(
    request: Request,
    courseSlug: string,
  ): Promise<CourseOverviewResponse> {
    if (isBuildPrerenderWithoutPublicApi()) {
      throw new Response("Course page will be generated during deployment.", {
        status: 404,
      });
    }
    return requestPublicData(
      request,
      `courses/${encodeURIComponent(courseSlug)}/overview`,
    );
  },
};
