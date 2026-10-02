import type { Config } from "@react-router/dev/config";
import { courseListResponseSchema } from "@veolms/contracts";
import { createLearningPrerenderPaths } from "./src/learning/prerenderLearningPaths";

const staticApplicationPages = [
  "/",
  // Auth routes need to be prerendered as well. In the static production
  // build, an unprerendered auth URL falls back to `/` and therefore omits the
  // route-critical auth stylesheet from the document head.
  "/login",
  "/mfa-setup",
  "/register",
  "/auth/callback",
  "/courses",
  "/explore-courses",
  "/settings",
  "/settings/profile",
  "/settings/appearance",
  "/settings/sidebar",
  "/settings/notifications",
  "/settings/learning",
  "/settings/security",
  "/settings/account",
];

const learningPrerenderScope =
  process.env.VEO_LEARNING_PRERENDER_SCOPE === "first-section"
    ? "first-section"
    : "all-lectures";

// React Router evaluates this config through Vite's config runner, whose
// environment is a dev server even during `react-router build`. The build
// wrapper sets this explicit flag so production prerenders use the full path
// set instead of the small development sample.
const isDevelopment = process.env.VEO_REACT_ROUTER_BUILD !== "true";
const developmentPrerenderCourseSlugs = ["tailwind-css"] as const;

const staticLearningPages = createLearningPrerenderPaths({
  courseSlugs: isDevelopment ? developmentPrerenderCourseSlugs : undefined,
  scope: learningPrerenderScope,
});

function getStaticApiBaseUrl() {
  const configured =
    process.env.STATIC_BUILD_API_URL || "http://127.0.0.1:4000/v1";
  const normalized = configured
    .replace(/\/+$/u, "")
    .replace(/\/api\/v1$/u, "/v1");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

async function getStaticCataloguePaths() {
  const response = await fetch(`${getStaticApiBaseUrl()}/courses`, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Unable to discover course overview pages from the build API (${response.status}).`,
    );
  }
  const body: unknown = await response.json();
  const payload =
    body && typeof body === "object" && "success" in body && "data" in body
      ? body.data
      : body;
  const result = courseListResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      "The build API returned an invalid published course catalogue.",
    );
  }
  return result.data.courses.map(
    ({ slug }) => `/explore-courses/${encodeURIComponent(slug)}`,
  );
}

const prerenderConfig = {
  paths: async () => [
    ...staticApplicationPages,
    ...(await getStaticCataloguePaths()),
    ...staticLearningPages,
  ],
  concurrency: 1,
  timeout: 120_000,
  retryCount: 2,
  retryDelay: 1_000,
};

export default {
  appDirectory: "src",
  // React Router accepts timeout/retry options at build time even though the
  // public Config type only documents paths and concurrency.
  // Prerendering is a build-time feature. Enabling it in `react-router dev`
  // disables SPA mode and makes the first request build the full server route
  // graph before it can render. Keep dev on the configured SPA fallback.
  prerender: isDevelopment
    ? false
    : (prerenderConfig as NonNullable<Config["prerender"]>),
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
