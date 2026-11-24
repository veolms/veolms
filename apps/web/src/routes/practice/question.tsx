import type { Route } from "./+types/question";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { PracticeQuestionPage } from "../../coding-practice/lab/PracticeQuestionPage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function PracticeQuestionPageRoute() {
  return <PracticeQuestionPage />;
}
