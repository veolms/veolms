import {
  LEGAL_PAGE_SLUGS,
  type LegalPage,
  type LegalPageSlug,
} from "@veolms/contracts";
import { useState } from "react";
import { BUILT_IN_LEGAL_DOCUMENTS } from "../../legal/legalDocuments";
import { LEGAL_PAGES } from "../../legal/legalPages";
import { useLegalPages } from "../../services/legal-pages";
import { SETTINGS_SELECT_TRIGGER } from "../../settings/SettingsControls";
import { ThemedSelect, type ThemedSelectOption } from "../../ThemedSelect";
import { PlatformSettingsStatus } from "../PlatformSettingsStatus";
import { StaticSiteRebuildSection } from "../StaticSiteRebuildSection";
import { LegalPageForm } from "./LegalPageForm";

/** The page's name as the legal pages' own menu shows it. */
function pageName(slug: LegalPageSlug) {
  return (
    LEGAL_PAGES.find((page) => page.path === `/${slug}`)?.title ??
    BUILT_IN_LEGAL_DOCUMENTS[slug].heading
  );
}

/**
 * The legal and company pages (Terms, Privacy, Refund & Cancellation, …):
 * an administrator rewrites one in Markdown, checks it in the preview and
 * saves it; the public pages are then built again so visitors and search
 * engines get the new text in the page itself.
 */
export function PlatformLegalPagesTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const query = useLegalPages();
  const [slug, setSlug] = useState<LegalPageSlug>("policies");
  const saved = new Map<LegalPageSlug, LegalPage>(
    (query.data?.pages ?? []).map((page) => [page.slug, page]),
  );
  const options: readonly ThemedSelectOption<LegalPageSlug>[] =
    LEGAL_PAGE_SLUGS.map((value) => [
      value,
      pageName(value),
      {
        subtitle: saved.has(value) ? "Edited here" : "Built-in text",
      },
    ]);

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Legal pages</h2>
          <p>
            The policy pages anyone can open from the menu and footer. Saving a
            page builds that page again, so visitors and search engines see the
            new text a few minutes later.
          </p>
        </div>
      </header>

      {query.data ? (
        <>
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
            <label
              htmlFor="platform-legal-page"
              className="text-[13px] font-medium text-(--text)"
            >
              Page
            </label>
            <ThemedSelect
              id="platform-legal-page"
              ariaLabel="Page to edit"
              triggerClassName={SETTINGS_SELECT_TRIGGER}
              value={slug}
              options={options}
              onValueChange={setSlug}
            />
          </div>
          <LegalPageForm
            // A new page starts a new draft.
            key={slug}
            slug={slug}
            name={pageName(slug)}
            builtIn={BUILT_IN_LEGAL_DOCUMENTS[slug]}
            saved={saved.get(slug) ?? null}
            setNotice={setNotice}
          />
          <StaticSiteRebuildSection />
        </>
      ) : (
        <PlatformSettingsStatus
          isError={query.isError}
          onRetry={() => void query.refetch()}
        />
      )}
    </div>
  );
}
