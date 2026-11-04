import type { Route } from "./+types/inbox";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { SupportInboxPage } from "../../support/inbox/SupportInboxPage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function SupportInboxRoute() {
  return <SupportInboxPage />;
}
