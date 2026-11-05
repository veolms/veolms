import type { Route } from "./+types/ticket";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { SupportTicketPage } from "../../support/SupportTicketPage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function SupportTicketRoute() {
  return <SupportTicketPage />;
}
