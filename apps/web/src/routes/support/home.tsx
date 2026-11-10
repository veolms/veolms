import type { Route } from "./+types/home";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { SupportHomePage } from "../../support/SupportHomePage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function SupportHomeRoute() {
  return <SupportHomePage />;
}
