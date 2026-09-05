import type { Config } from "@react-router/dev/config";
import { createLearningPrerenderPaths } from "./src/learning/prerenderLearningPaths";

const staticApplicationPages = [
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

const staticLearningPages = createLearningPrerenderPaths({
  scope: learningPrerenderScope,
});

const prerenderConfig = {
  paths: [...staticApplicationPages, ...staticLearningPages],
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
