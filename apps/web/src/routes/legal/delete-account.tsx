import { LegalPageRoute, legalPageMeta } from "../../legal/LegalPageRoute";
import type { AcademyStaticPageData } from "../academyStaticPageData";
import type { Route } from "./+types/delete-account";

export function meta({ matches }: Route.MetaArgs) {
  const root = matches[0]?.loaderData as
    AcademyStaticPageData | null | undefined;
  return legalPageMeta(
    "delete-account",
    root?.legalPage?.slug === "delete-account" ? root.legalPage : undefined,
  );
}

export default function LegalRoute() {
  return <LegalPageRoute slug="delete-account" />;
}
