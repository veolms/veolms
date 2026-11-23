import type { Route } from "./+types/course";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { CoursePracticePage } from "../../coding-practice/lab/CoursePracticePage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function CoursePracticePageRoute() {
  return <CoursePracticePage />;
}
