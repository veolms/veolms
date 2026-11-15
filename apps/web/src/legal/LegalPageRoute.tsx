import type { LegalPageResponse, LegalPageSlug } from "@veolms/contracts";
import { useMemo } from "react";
import { useRouteLoaderData } from "react-router";
import { Button } from "../components/Button";
import type { AcademyStaticPageData } from "../routes/academyStaticPageData";
import { useLegalPage } from "../services/legal-pages";
import { LegalPageLayout, type LegalPageDetails } from "./LegalPageLayout";
import { legalDocumentFromContent } from "./legalMarkdownDocument";
import { LEGAL_PAGES } from "./legalPages";

/** The page built into this file at deploy time, when it is this one. */
export function useBuiltLegalPage(
  slug: LegalPageSlug,
): LegalPageResponse | undefined {
  const pageData = useRouteLoaderData("root") as
    AcademyStaticPageData | null | undefined;
  const built = pageData?.legalPage;
  return built?.slug === slug ? built : undefined;
}

/** The head of a legal page: from the built copy, or the page's name. */
export function legalPageMeta(
  slug: LegalPageSlug,
  built: LegalPageResponse | undefined,
) {
  const fallback = LEGAL_PAGES.find((page) => page.slug === slug)?.title;
  return [
    { title: built?.title ?? fallback ?? "Legal" },
    ...(built?.description
      ? [{ name: "description", content: built.description }]
      : []),
  ];
}

const NO_DETAILS: LegalPageDetails = {
  academyName: "",
  companyName: "",
  contactEmail: "",
};

function PageSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {[92, 100, 84, 96, 70].map((width, index) => (
        <span
          key={index}
          className="h-4 animate-pulse rounded-md bg-(--hover)"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

/**
 * A legal or company page: the copy built into the page at deploy time
 * shows at once, and is replaced by the current words when they differ.
 */
export function LegalPageRoute({ slug }: { slug: LegalPageSlug }) {
  const built = useBuiltLegalPage(slug);
  const {
    data: page,
    isError,
    refetch,
    isFetching,
  } = useLegalPage(slug, built);
  const link = LEGAL_PAGES.find((entry) => entry.slug === slug)!;

  const document = useMemo(
    () =>
      page
        ? legalDocumentFromContent(link.path, page)
        : {
            path: link.path,
            title: link.title,
            description: "",
            heading: link.title,
            intro: null,
            sections: [],
            body: isError ? (
              <div className="flex flex-col items-start gap-3">
                <p>This page could not be loaded.</p>
                <Button onClick={() => void refetch()} disabled={isFetching}>
                  Try again
                </Button>
              </div>
            ) : (
              <PageSkeleton />
            ),
          },
    [page, link, isError, isFetching, refetch],
  );

  return (
    <LegalPageLayout
      document={document}
      details={page?.details ?? NO_DETAILS}
    />
  );
}
