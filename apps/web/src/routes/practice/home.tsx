import { Navigate } from "react-router";
import type { Route } from "./+types/home";
import { getRouteMeta } from "../../routing/routeDescriptors";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

/**
 * /practice was the Coding Lab's own page. Practice now lives on the
 * Progress page (25 Nov 2026); older links and bookmarks land there.
 */
export default function PracticeHomePageRoute() {
  return <Navigate to="/progress#coding-practice" replace />;
}
