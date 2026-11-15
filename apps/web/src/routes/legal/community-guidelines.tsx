import { LegalPageRoute, legalPageMeta } from "../../legal/LegalPageRoute";
import type { AcademyStaticPageData } from "../academyStaticPageData";
import type { Route } from "./+types/community-guidelines";

export function meta({ matches }: Route.MetaArgs) {
  const root = matches[0]?.loaderData as
    AcademyStaticPageData | null | undefined;
  return legalPageMeta(
    "community-guidelines",
    root?.legalPage?.slug === "community-guidelines"
      ? root.legalPage
      : undefined,
  );
}

export default function LegalRoute() {
  return <LegalPageRoute slug="community-guidelines" />;
}
