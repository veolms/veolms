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

export default {
  appDirectory: "src",
  prerender: {
    paths: [...staticApplicationPages, ...staticLearningPages],
    concurrency: 4,
  },
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
