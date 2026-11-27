import type { Route } from "./+types/verify";
import { getRouteMeta } from "../../routing/routeDescriptors";
import { CertificateVerifyPage } from "../../certificates/CertificateVerifyPage";

export function meta({ location, matches, params }: Route.MetaArgs) {
  return [
    ...Object.entries(
      getRouteMeta(matches.at(-1)?.id, params, location.pathname),
    ).map(([name, content]) =>
      name === "title" ? { title: content } : { name, content },
    ),
    // People's names: reached by sharing, never by search.
    { name: "robots", content: "noindex" },
  ];
}

export default function CertificateVerifyRoute() {
  return <CertificateVerifyPage />;
}
