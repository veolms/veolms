import type { Route } from "./+types/chat";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { ChatPage } from "../../chat/ChatPage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function ChatRoute() {
  return <ChatPage />;
}
