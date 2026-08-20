import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src",
  routeDiscovery: { mode: "initial" },
  ssr: false,
} satisfies Config;
