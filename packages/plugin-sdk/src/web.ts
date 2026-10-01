import type { RouteConfigEntry } from "@react-router/dev/routes";

/**
 * Extension that adds pages / routes to the VeoLMS web app.
 * Passed via createVeoLMSWeb({ extensions }).
 */
export interface WebExtension {
  name: string;
  /** Additional React Router routes to merge into the route tree. */
  routes?: RouteConfigEntry[];
}
