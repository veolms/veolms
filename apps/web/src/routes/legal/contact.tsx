import { LegalPageRoute, legalPageMeta } from "../../legal/LegalPageRoute";
import type { AcademyStaticPageData } from "../academyStaticPageData";
import type { Route } from "./+types/contact";

export function meta({ matches }: Route.MetaArgs) {
  const root = matches[0]?.loaderData as
    AcademyStaticPageData | null | undefined;
  return legalPageMeta(
    "contact",
    root?.legalPage?.slug === "contact" ? root.legalPage : undefined,
  );
}

export default function LegalRoute() {
  return <LegalPageRoute slug="contact" />;
}
