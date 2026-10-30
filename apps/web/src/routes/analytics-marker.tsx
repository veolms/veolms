import type { Route } from "./+types/analytics-marker";
import { configuredSiteOrigin } from "../routing/configuredSiteOrigin";
import { getRouteMeta, getRouteShareTags } from "../routing/routeDescriptors";
import { PLATFORM_ROUTE_STYLESHEETS } from "./settingsRouteStylesheets";

/**
 * The analytics page is laid out with the Settings page's pinned section
 * tabs, so their stylesheets are linked in the document's head here: the
 * page's chrome (heading, tabs, filters) is drawn before the page's own
 * code arrives, and must already be styled when it is.
 */
export const links: Route.LinksFunction = () =>
  PLATFORM_ROUTE_STYLESHEETS.map((href) => ({ rel: "stylesheet", href }));

export function meta({ location, matches, params }: Route.MetaArgs) {
  const routeId = matches.at(-1)?.id;
  return [
    ...Object.entries(
      getRouteMeta(routeId, params, location.pathname, matches),
    ).map(([name, content]) =>
      name === "title" ? { title: content } : { name, content },
    ),
    ...getRouteShareTags(
      routeId,
      params,
      location.pathname,
      matches,
      configuredSiteOrigin,
    ),
  ];
}

export default function AnalyticsMarker() {
  return null;
}
