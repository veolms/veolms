import type { Route } from "./+types/academy-marker";
import { getRouteMeta } from "../routing/routeDescriptors";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function AcademyMarker() {
  return null;
}
