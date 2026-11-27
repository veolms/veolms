import type { LegalPage } from "@veolms/contracts";
import { useMemo } from "react";
import { useRouteLoaderData } from "react-router";
import type { AcademyStaticPageData } from "../routes/academyStaticPageData";
import type { LegalDocument } from "./legalDocument";
import { legalDocumentFromPage } from "./legalMarkdown";
import { LegalPageLayout } from "./LegalPageLayout";

/** The page's saved text from the root loader's data, when it is this page's. */
function savedPage(
  builtIn: LegalDocument,
  data: AcademyStaticPageData | null | undefined,
): LegalPage | undefined {
  const page = data?.legalPage;
  return page && `/${page.slug}` === builtIn.path ? page : undefined;
}

function resolveDocument(
  builtIn: LegalDocument,
  data: AcademyStaticPageData | null | undefined,
) {
  const page = savedPage(builtIn, data);
  return page ? legalDocumentFromPage(builtIn, page) : builtIn;
}

interface MetaMatch {
  id: string;
  loaderData?: unknown;
}

/**
 * A legal page's route: its built-in document, or the text an administrator
 * saved for it (Platform → Legal pages), which the build reads into the
 * root loader's data so the prerendered page and its head carry it.
 */
export function createLegalRoute(builtIn: LegalDocument) {
  function meta({ matches }: { matches: readonly (MetaMatch | undefined)[] }) {
    const data = matches.find((match) => match?.id === "root")?.loaderData as
      AcademyStaticPageData | null | undefined;
    const page = savedPage(builtIn, data) ?? builtIn;
    return [
      { title: page.title },
      { name: "description", content: page.description },
    ];
  }

  function LegalRoute() {
    const data = useRouteLoaderData("root") as
      AcademyStaticPageData | null | undefined;
    const document = useMemo(() => resolveDocument(builtIn, data), [data]);
    return <LegalPageLayout document={document} />;
  }

  return { meta, LegalRoute };
}
