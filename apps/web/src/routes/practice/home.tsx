import type { Route } from "./+types/home";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { PracticeHomePage } from "../../coding-practice/lab/PracticeHomePage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function PracticeHomePageRoute() {
  return <PracticeHomePage />;
}
