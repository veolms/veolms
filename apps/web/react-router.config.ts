import type { Config } from "@react-router/dev/config";
import {
  courseListResponseSchema,
  coursePublicCurriculumSchema,
} from "@veolms/contracts";
import {
  createLearningPrerenderPaths,
  type LearningPrerenderScope,
} from "./src/learning/prerenderLearningPaths";
import { fetchStaticBuildApi } from "./src/routes/staticBuildApi";

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
  "/home",
  "/settings",
  "/settings/profile",
  "/settings/appearance",
  "/settings/sidebar",
  "/settings/notifications",
  "/settings/learning",
  "/settings/security",
  "/settings/account",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/contact",
  "/about",
];

const requestedLearningPrerenderScope =
  process.env.VEO_LEARNING_PRERENDER_SCOPE;
const learningPrerenderScope: LearningPrerenderScope =
  requestedLearningPrerenderScope === "none" ||
  requestedLearningPrerenderScope === "first-section"
    ? requestedLearningPrerenderScope
    : "all-lectures";

// `VEO_LEARNING_PRERENDER_ONLY` ("<course>:<count>,..."): lesson pages for
// those courses only, their first <count> lessons each (a local trial, see
// scripts/build-performance.mjs `--lessons=`).
const learningPrerenderOnly = new Map(
  (process.env.VEO_LEARNING_PRERENDER_ONLY ?? "")
    .split(",")
    .map((entry) => entry.trim().split(":"))
    .filter(([slug, count]) => slug && Number(count) > 0)
    .map(([slug, count]) => [slug, Math.floor(Number(count))] as const),
);

// React Router evaluates this config through Vite's config runner, whose
// environment is a dev server even during `react-router build`. The build
// wrapper sets this explicit flag; without it nothing is prerendered.
const isDevelopment = process.env.VEO_REACT_ROUTER_BUILD !== "true";

function getStaticApiBaseUrl() {
  const configured =
    process.env.STATIC_BUILD_API_URL || "http://127.0.0.1:4000/v1";
  const normalized = configured
    .replace(/\/+$/u, "")
    .replace(/\/api\/v1$/u, "/v1");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

/** Far more pages than any catalogue has; only guards against a cursor that never ends. */
const MAX_CATALOGUE_PAGES = 500;

async function getStaticCataloguePaths() {
  // The catalogue is paged (60 at most per request). Only the first page
  // used to be read, and it is ordered oldest first — so once an academy
  // had more than 60 courses, the newest ones got no page at all.
  const slugs: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_CATALOGUE_PAGES; page += 1) {
    const url = new URL(`${getStaticApiBaseUrl()}/courses`);
    url.searchParams.set("limit", "60");
    if (cursor) url.searchParams.set("cursor", cursor);
    // Discovery runs before prerendering starts, so it can outwait a full
    // API restart; nothing times this call out.
    const response = await fetchStaticBuildApi(url.toString(), 90_000);
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
    slugs.push(...result.data.courses.map(({ slug }) => slug));
    cursor = result.data.nextCursor;
    if (!cursor) break;
  }
  return [...new Set(slugs)];
}

function unwrapApiData(body: unknown) {
  return body && typeof body === "object" && "success" in body && "data" in body
    ? body.data
    : body;
}

/**
 * Every lesson page of the catalogue's courses, numbered as their public
 * curricula number them. A course without one (none published yet) has
 * none.
 */
async function getStaticLearningPaths(courseSlugs: readonly string[]) {
  if (learningPrerenderScope === "none") return [];
  const courses = [];
  for (const slug of courseSlugs) {
    if (learningPrerenderOnly.size > 0 && !learningPrerenderOnly.has(slug)) {
      continue;
    }
    const response = await fetchStaticBuildApi(
      `${getStaticApiBaseUrl()}/courses/${encodeURIComponent(slug)}/curriculum`,
      90_000,
    );
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(
        `Unable to read the curriculum of ${slug} from the build API (${response.status}).`,
      );
    }
    const result = coursePublicCurriculumSchema.safeParse(
      unwrapApiData(await response.json()),
    );
    if (!result.success) {
      throw new Error(
        `The build API returned an invalid curriculum for ${slug}.`,
      );
    }
    const lessonCount = result.data.sections.reduce(
      (total, section) => total + (section.lessons?.length ?? 0),
      0,
    );
    courses.push({
      slug,
      lessonCount: Math.min(
        lessonCount,
        learningPrerenderOnly.get(slug) ?? lessonCount,
      ),
    });
  }
  return createLearningPrerenderPaths({
    courses,
    scope: learningPrerenderScope,
  });
}

const prerenderConfig = {
  paths: async () => {
    const courseSlugs = await getStaticCataloguePaths();
    return [
      ...staticApplicationPages,
      ...courseSlugs.map(
        (slug) => `/courses/${encodeURIComponent(slug)}/overview`,
      ),
      ...(await getStaticLearningPaths(courseSlugs)),
    ];
  },
  // Pages rendered at once. A lesson page mostly waits on the API, so a
  // deployment build (over a thousand pages) sets a few; one by default.
  concurrency: Math.max(1, Number(process.env.VEO_PRERENDER_CONCURRENCY) || 1),
  timeout: 120_000,
  retryCount: 2,
  retryDelay: 1_000,
};

export default {
  appDirectory: "src",
  // React Router 8.3 passes only `concurrency` on to its prerender pass: the
  // timeout/retry options above are ignored, and each prerender request has
  // a fixed 10 second limit (see warmServerBuildPlugin in vite.config.ts).
  // Prerendering is a build-time feature. Enabling it in `react-router dev`
  // disables SPA mode and makes the first request build the full server route
  // graph before it can render. Keep dev on the configured SPA fallback.
  prerender: isDevelopment
    ? false
    : (prerenderConfig as NonNullable<Config["prerender"]>),
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
