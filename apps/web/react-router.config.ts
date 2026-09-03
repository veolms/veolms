import type { Config } from "@react-router/dev/config";

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

export default {
  appDirectory: "src",
  prerender: {
    paths: staticApplicationPages,
    concurrency: 4,
  },
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
