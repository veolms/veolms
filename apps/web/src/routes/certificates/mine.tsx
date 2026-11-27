import type { Route } from "./+types/mine";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { MyCertificatesPage } from "../../certificates/MyCertificatesPage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta(matches.at(-1)?.id, params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function MyCertificatesRoute() {
  return <MyCertificatesPage />;
}
