import type { RouteConfig, RouteConfigEntry } from "@react-router/dev/routes";

import { getCoreRoutes } from "./routes/index.ts";
import type { CreateVeoLMSWebOptions } from "./types.ts";

/**
 * Core React Router route configuration factory.
 *
 * Returns the full VeoLMS route tree. Cloud apps call this with optional
 * `extensions` to append private routes without modifying core.
 */
export function createVeoLMSWeb(
  options: CreateVeoLMSWebOptions = {},
): RouteConfig {
  const { extensions = [] } = options;

  const coreRoutes = getCoreRoutes();

  // Append routes from each extension after the core routes.
  const extensionRoutes = extensions.flatMap(
    (ext) => ext.routes ?? [],
  ) satisfies RouteConfigEntry[];

  return [...coreRoutes, ...extensionRoutes] satisfies RouteConfig;
}
