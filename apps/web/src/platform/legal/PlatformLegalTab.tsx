import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import type { LegalPageSlug } from "@veolms/contracts";
import { useState } from "react";
import { SettingsSection } from "../../home-page-settings/homePageSettingsControls";
import { useAdminLegalPages } from "../../services/legal-pages";
import { usePlatformSettings } from "../../services/platform";
import { PlatformSettingsStatus } from "../PlatformSettingsStatus";
import { LegalDetailsForm } from "./LegalDetailsForm";
import { LegalPageEditor } from "./LegalPageEditor";
import { PLACEHOLDER_LABELS } from "./legalPlaceholders";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Platform › Legal pages: who the pages name, and each page's words, from
 * the default template or the academy's own.
 */
export function PlatformLegalTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const [editing, setEditing] = useState<LegalPageSlug | null>(null);

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Legal pages</h2>
          <p>
            The Terms, Privacy, Refund and company pages anyone can open from
            the site. Each starts from a default text with your details filled
            in; edit any of them to make it your own.
          </p>
        </div>
      </header>
      {editing ? (
        <LegalPageEditor
          slug={editing}
          onBack={() => setEditing(null)}
          setNotice={setNotice}
        />
      ) : (
        <LegalPagesOverview onEdit={setEditing} setNotice={setNotice} />
      )}
    </div>
  );
}

function LegalPagesOverview({
  onEdit,
  setNotice,
}: {
  onEdit: (slug: LegalPageSlug) => void;
  setNotice?: (message: string) => void;
}) {
  const settings = usePlatformSettings();
  const pages = useAdminLegalPages();

  if (!settings.data || !pages.data) {
    return (
      <PlatformSettingsStatus
        isError={settings.isError || pages.isError}
        onRetry={() => {
          void settings.refetch();
          void pages.refetch();
        }}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <LegalDetailsForm
        saved={settings.data.settings.legal}
        invoice={settings.data.settings.invoice}
        academyName={pages.data.values.academyName}
        setNotice={setNotice}
      />
      <SettingsSection
        id="platform-legal-pages-heading"
        title="Pages"
        description="Open a page to read or change its words."
      >
        <ul className="m-0 grid list-none gap-2 p-0">
          {pages.data.pages.map((page) => (
            <li key={page.slug} className="min-w-0">
              <button
                type="button"
                onClick={() => onEdit(page.slug)}
                className="flex min-h-15 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-left transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-(--text)">
                    {page.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {page.customized ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Edited
                        {page.updatedAt
                          ? ` ${dateFormat.format(new Date(page.updatedAt))}`
                          : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md border border-(--border) bg-(--surface-strong) px-2 py-0.5 text-[11px] font-semibold text-(--muted)">
                        Default text
                      </span>
                    )}
                    {page.missing.length > 0 ? (
                      <span className="inline-flex items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Needs{" "}
                        {page.missing
                          .map((name) => PLACEHOLDER_LABELS[name].toLowerCase())
                          .join(", ")}
                      </span>
                    ) : null}
                  </span>
                </span>
                <CaretRight
                  size={16}
                  className="shrink-0 text-(--muted)"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
