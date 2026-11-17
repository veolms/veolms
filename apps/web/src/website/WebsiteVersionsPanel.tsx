import { sitePageSlugSchema, type SitePageResponse } from "@veolms/contracts";
import { useState } from "react";
import { Button } from "../components/Button";
import { SlideOverPanel } from "../components/SlideOverPanel";
import { getApiError } from "../lib/api-error";
import {
  useRestoreWebsiteVersion,
  useUnpublishWebsitePage,
  useUpdateWebsitePage,
} from "../services/website";
import { inputClass } from "../workshops/workshopHelpers";
import { formatWhen } from "./websiteHelpers";

const dividerClass = "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";

function PageDetailsForm({
  page,
  onChanged,
}: {
  page: SitePageResponse;
  onChanged: (page: SitePageResponse) => void;
}) {
  const update = useUpdateWebsitePage();
  const [title, setTitle] = useState(page.page.title);
  const [slug, setSlug] = useState(page.page.slug);
  const [error, setError] = useState<string | null>(null);
  const slugOk = sitePageSlugSchema.safeParse(slug).success;
  const changed = title.trim() !== page.page.title || slug !== page.page.slug;

  async function save() {
    setError(null);
    try {
      onChanged(
        await update.mutateAsync({
          id: page.page.id,
          body: { title: title.trim(), slug },
        }),
      );
    } catch (failure) {
      setError(getApiError(failure).message);
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="grid gap-1 text-sm font-medium text-(--text)">
        Page name
        <input
          className={`${inputClass} w-full`}
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-(--text)">
        Address
        <span className="flex items-center gap-1">
          <span className="text-sm text-(--muted)">/</span>
          <input
            className={`${inputClass} w-full font-mono`}
            value={slug}
            maxLength={60}
            aria-invalid={!slugOk}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
          />
        </span>
        {!slugOk ? (
          <span className="text-xs font-normal text-rose-500">
            Use lowercase letters, numbers and hyphens.
          </span>
        ) : (
          <span className="text-xs font-normal text-(--muted)">
            Buttons on other pages follow the new address.
          </span>
        )}
      </label>
      {error ? <p className="m-0 text-sm text-rose-500">{error}</p> : null}
      <div>
        <Button
          type="submit"
          variant="quiet"
          disabled={!changed || !slugOk || !title.trim() || update.isPending}
        >
          {update.isPending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}

/** The page's name and address, its published versions, and taking it down. */
export function WebsiteVersionsPanel({
  isOpen,
  onClose,
  page,
  onChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  page: SitePageResponse;
  onChanged: (page: SitePageResponse) => void;
}) {
  const restore = useRestoreWebsiteVersion();
  const unpublish = useUnpublishWebsitePage();
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;

  async function run(action: () => Promise<SitePageResponse>) {
    setError(null);
    try {
      onChanged(await action());
    } catch (failure) {
      setError(getApiError(failure).message);
    }
  }

  return (
    <SlideOverPanel
      label="Page details and versions"
      title="Page details and versions"
      onClose={onClose}
      closeLabel="Close"
    >
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5 sm:p-6">
        <section aria-label="Page details">
          <PageDetailsForm
            key={page.page.id}
            page={page}
            onChanged={onChanged}
          />
        </section>
        <section
          aria-label="Versions"
          className={`border-t pt-5 ${dividerClass}`}
        >
          <h2 className="m-0 text-sm font-bold text-(--text)">Versions</h2>
          <p className="mt-1 mb-3 text-xs text-(--muted)">
            Each publish is kept. Put an earlier one live if something went
            wrong; your draft stays as it is.
          </p>
          {page.versions.length === 0 ? (
            <p className="m-0 text-sm text-(--muted)">Not published yet.</p>
          ) : (
            <ul className={`m-0 list-none divide-y p-0 ${dividerClass}`}>
              {page.versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div>
                    <p className="m-0 text-sm font-semibold text-(--text)">
                      Version {version.number}
                    </p>
                    <p className="m-0 text-xs text-(--muted)">
                      Published {formatWhen(version.publishedAt)}
                    </p>
                  </div>
                  {version.isLive ? (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                      Live
                    </span>
                  ) : (
                    <Button
                      variant="quiet"
                      disabled={restore.isPending}
                      onClick={() =>
                        void run(() =>
                          restore.mutateAsync({
                            id: page.page.id,
                            versionId: version.id,
                          }),
                        )
                      }
                    >
                      Put live
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {page.page.status !== "draft" ? (
          <section className={`border-t pt-5 ${dividerClass}`}>
            <h2 className="m-0 text-sm font-bold text-(--text)">
              Take the page down
            </h2>
            <p className="mt-1 mb-3 text-xs text-(--muted)">
              Visitors stop seeing it. Its draft and versions are kept.
            </p>
            <Button
              variant="danger"
              disabled={unpublish.isPending}
              onClick={() =>
                void run(() => unpublish.mutateAsync(page.page.id))
              }
            >
              {unpublish.isPending ? "Taking down…" : "Take down"}
            </Button>
          </section>
        ) : null}
        {error ? <p className="m-0 text-sm text-rose-500">{error}</p> : null}
      </div>
    </SlideOverPanel>
  );
}
