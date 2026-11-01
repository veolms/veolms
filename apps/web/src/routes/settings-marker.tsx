import type { Route } from "./+types/settings-marker";
import { SETTINGS_ROUTE_STYLESHEETS } from "./settingsRouteStylesheets";
import { getRouteMeta } from "../routing/routeDescriptors";

export const links: Route.LinksFunction = () =>
  SETTINGS_ROUTE_STYLESHEETS.map((href) => ({ rel: "stylesheet", href }));

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function SettingsMarker() {
  return null;
}
