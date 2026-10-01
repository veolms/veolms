import type { RouteConfig, RouteConfigEntry } from "@veolms/plugin-sdk";

import { getCoreRoutes } from "./routes/index.ts";
import type { CreateVeoLMSWebOptions } from "./types.ts";

/**
 * Recursively remove routes whose `id` appears in the exclusion set.
 * Children of removed parent routes are also removed.
 */
function excludeRoutes(
  routes: RouteConfigEntry[],
  excludeIds: ReadonlySet<string>,
): RouteConfigEntry[] {
  const result: RouteConfigEntry[] = [];
  for (const entry of routes) {
    if (entry.id !== undefined && excludeIds.has(entry.id)) {
      continue;
    }
    result.push(
      entry.children
        ? { ...entry, children: excludeRoutes(entry.children, excludeIds) }
        : entry,
    );
  }
  return result;
}

/**
 * Core React Router route configuration factory.
 *
 * Returns the full VeoLMS route tree. Cloud apps call this with optional
 * `extensions` to append private routes and `excludeRouteIds` to remove
 * specific core routes — without modifying core source files.
 */
export function createVeoLMSWeb(
  options: CreateVeoLMSWebOptions = {},
): RouteConfig {
  const { extensions = [], excludeRouteIds = [] } = options;

  const rawCoreRoutes = getCoreRoutes();

  const coreRoutes =
    excludeRouteIds.length > 0
      ? excludeRoutes(rawCoreRoutes, new Set(excludeRouteIds))
      : rawCoreRoutes;

  // Append routes from each extension after the (filtered) core routes.
  const extensionRoutes = extensions.flatMap(
    (ext) => ext.routes ?? [],
  ) satisfies RouteConfigEntry[];

  return [...coreRoutes, ...extensionRoutes] satisfies RouteConfig;
}

