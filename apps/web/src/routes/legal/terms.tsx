import { LegalPageRoute, legalPageMeta } from "../../legal/LegalPageRoute";
import type { AcademyStaticPageData } from "../academyStaticPageData";
import type { Route } from "./+types/terms";

export function meta({ matches }: Route.MetaArgs) {
  const root = matches[0]?.loaderData as
    AcademyStaticPageData | null | undefined;
  return legalPageMeta(
    "terms",
    root?.legalPage?.slug === "terms" ? root.legalPage : undefined,
  );
}

export default function LegalRoute() {
  return <LegalPageRoute slug="terms" />;
}
