import type { Config } from "@react-router/dev/config";
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

const isDevelopment = import.meta.env.DEV;
const developmentPrerenderCourseSlugs = ["tailwind-css"] as const;

const staticLearningPages = createLearningPrerenderPaths({
  courseSlugs: isDevelopment
    ? developmentPrerenderCourseSlugs
    : undefined,
  scope: learningPrerenderScope,
});

const prerenderConfig = {
  // React Router still renders configured prerender paths through its dev
  // server. Keep development focused on the small Tailwind CSS course so
  // other routes use the SPA fallback while the full production prerender
  // set remains unchanged.
  paths: isDevelopment
    ? staticLearningPages
    : [...staticApplicationPages, ...staticLearningPages],
  concurrency: 1,
  timeout: 120_000,
  retryCount: 2,
  retryDelay: 1_000,
};

export default {
  appDirectory: "src",
  // React Router accepts timeout/retry options at build time even though the
  // public Config type only documents paths and concurrency.
  prerender: prerenderConfig as NonNullable<Config["prerender"]>,
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
