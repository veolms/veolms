import type { LinksFunction, MetaFunction } from "react-router";

import { getRouteMeta } from "../routing/routeDescriptors";
import profileStylesheet from "../styles/features/profile.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: profileStylesheet }];

export const meta: MetaFunction = ({ location, matches, params }) =>
  Object.entries(getRouteMeta(matches.at(-1)?.id, params, location.pathname)).map(
    ([name, content]) => (name === "title" ? { title: content } : { name, content }),
  );

export default function PublicProfileMarker() {
  return null;
}
