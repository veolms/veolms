import type { Route } from "./+types/academy-marker";
import { configuredSiteOrigin } from "../routing/configuredSiteOrigin";
import { getRouteMeta, getRouteShareTags } from "../routing/routeDescriptors";

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

export default function AcademyMarker() {
  return null;
}
