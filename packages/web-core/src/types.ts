import type { WebExtension } from "@veolms/plugin-sdk";

export type {
  CreateIndexOptions,
  CreateLayoutOptions,
  CreateRouteOptions,
  RouteConfig,
  RouteConfigEntry,
  WebExtension,
} from "@veolms/plugin-sdk";
export { index, layout, prefix, route } from "@veolms/plugin-sdk";


export interface CreateVeoLMSWebOptions {
  /** Cloud-only web extensions that add additional routes to the route tree. */
  extensions?: WebExtension[];
  /**
   * Route IDs from the core route tree to remove before returning the config.
   * Matches the `id` field passed to `route()`, `layout()`, or `index()` in
   * `core/packages/web-core/src/routes/`.
   *
   * @example Disable public catalogue pages:
   * ```ts
   * createVeoLMSWeb({ excludeRouteIds: ["public-courses", "public-course-overview"] })
   * ```
   */
  excludeRouteIds?: string[];
}

