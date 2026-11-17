import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router";
import {
  sitePageSlugSchema,
  type SiteLook,
  type SitePageSummary,
  type SitePageType,
} from "@veolms/contracts";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { BrowserIcon as Browser } from "@phosphor-icons/react/Browser";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import { getApiError } from "../lib/api-error";
import type { NavigateTo } from "../routing/navigation";
import { useCapabilities } from "../services/authorization";
import {
  useCreateWebsitePage,
  useDeleteWebsitePage,
  useSaveWebsiteLook,
  useWebsiteOverview,
} from "../services/website";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { inputClass, surfaceClass } from "../workshops/workshopHelpers";
import { WebsiteThemePicker } from "./WebsiteThemePicker";
import {
  PAGE_TYPE_CHOICES,
  WEBSITE_PATH,
  formatWhen,
  livePageUrl,
  pageStatusClass,
  pageStatusLabel,
  slugify,
  websitePagePath,
} from "./websiteHelpers";

// Puck and the section fields load only when a page is opened for editing.
const WebsiteEditor = lazy(() =>
  import("./WebsiteEditor").then((module) => ({
    default: module.WebsiteEditor,
  })),
);

export interface WebsitePageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const dividerClass = "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";

function AccessDenied({ onNavigatePage }: { onNavigatePage?: NavigateTo }) {
  return (
    <main className="mx-auto grid w-full max-w-xl place-items-center py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-(--accent)/10 text-(--accent)">
        <LockSimple size={24} weight="bold" />
      </span>
      <h1 className="mt-4 mb-0 text-xl font-bold text-(--text)">
        The website is for the academy’s admins
      </h1>
      <p className="mt-2 mb-0 text-sm leading-6 text-(--muted)">
        Ask an admin for the platform settings permission if you need it.
      </p>
      <div className="mt-5">
        <Button variant="quiet" onClick={() => onNavigatePage?.("/")}>
          Go home
        </Button>
      </div>
    </main>
  );
}

function PageRow({
  page,
  onOpen,
  onDelete,
}: {
  page: SitePageSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const liveUrl = livePageUrl(page);
  return (
    <li className="group/row flex items-center gap-2 pr-3 sm:pr-5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Edit ${page.title}`}
        className="grid min-w-0 flex-1 cursor-pointer gap-0.5 border-none bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-visible:outline-none sm:px-7"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-(--text) sm:text-[15px]">
            {page.title}
          </span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${pageStatusClass(page.status)}`}
          >
            {pageStatusLabel(page.status)}
          </span>
        </span>
        <span className="truncate font-mono text-xs text-(--muted)">
          /{page.slug}
        </span>
        <span className="text-xs text-(--text-secondary,var(--muted))">
          {page.publishedAt
            ? `Published ${formatWhen(page.publishedAt)}`
            : `Edited ${formatWhen(page.updatedAt)}`}
        </span>
      </button>
      {liveUrl ? (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${page.title} live`}
          title="View live"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-(--text)"
        >
          <ArrowSquareOut size={17} />
        </a>
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${page.title}`}
        title="Delete"
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) transition-colors hover:bg-rose-500/10 hover:text-rose-500"
      >
        <Trash size={17} />
      </button>
    </li>
  );
}

function NewPageDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (pageId: string) => void;
}) {
  const create = useCreateWebsitePage();
  const [type, setType] = useState<SitePageType>("home");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address = slugEdited ? slug : slugify(title);
  const addressOk = sitePageSlugSchema.safeParse(address).success;

  async function submit() {
    setError(null);
    if (!title.trim() || !addressOk) {
      setError("Give the page a name and an address.");
      return;
    }
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        slug: address,
        type,
      });
      onCreated(created.page.id);
    } catch (failure) {
      setError(getApiError(failure).message);
    }
  }

  return (
    <ConfirmActionModal
      id="website-new-page"
      isOpen={isOpen}
      isPending={create.isPending}
      onClose={onClose}
      onConfirm={() => void submit()}
      icon={Browser}
      title="Add a page"
      description="Pick a starting point. You can change every section."
      cancelLabel="Cancel"
      confirmLabel="Add page"
      pendingLabel="Adding…"
    >
      <div className="grid gap-4 text-left">
        <label className="grid gap-1 text-sm font-medium text-(--text)">
          Page name
          <input
            className={`${inputClass} w-full`}
            value={title}
            maxLength={120}
            placeholder="Diwali offer"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-(--text)">
          Address
          <span className="flex items-center gap-1">
            <span className="text-sm text-(--muted)">/</span>
            <input
              className={`${inputClass} w-full font-mono`}
              value={address}
              maxLength={60}
              aria-invalid={address.length > 0 && !addressOk}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value.toLowerCase());
              }}
            />
          </span>
        </label>
        <div
          role="radiogroup"
          aria-label="Starting point"
          className="grid gap-2 sm:grid-cols-2"
        >
          {PAGE_TYPE_CHOICES.map((choice) => (
            <button
              key={choice.type}
              type="button"
              role="radio"
              aria-checked={type === choice.type}
              onClick={() => setType(choice.type)}
              className={`grid cursor-pointer gap-0.5 rounded-xl border bg-transparent p-3 text-left transition-colors ${
                type === choice.type
                  ? "border-(--accent) ring-2 ring-(--accent)/20"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
              }`}
            >
              <span className="text-sm font-semibold text-(--text)">
                {choice.title}
              </span>
              <span className="text-xs leading-5 text-(--muted)">
                {choice.description}
              </span>
            </button>
          ))}
        </div>
        {error ? <p className="m-0 text-sm text-rose-500">{error}</p> : null}
      </div>
    </ConfirmActionModal>
  );
}

function WebsiteHome({ onNavigatePage, setNotice }: WebsitePageProps) {
  const overview = useWebsiteOverview();
  const saveLook = useSaveWebsiteLook();
  const remove = useDeleteWebsitePage();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<SitePageSummary | null>(null);
  const [lookError, setLookError] = useState<string | null>(null);

  function changeLook(look: SiteLook) {
    setLookError(null);
    saveLook.mutate(look, {
      onSuccess: () => setNotice?.("Your site’s look is updated."),
      onError: (failure) => setLookError(getApiError(failure).message),
    });
  }

  if (overview.isLoading) {
    return (
      <CenteredLoadingSpinner
        label="Loading your website"
        className="min-h-80"
      />
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <div className="grid place-items-center p-10 text-center">
        <p className="m-0 text-sm text-(--muted)">
          Your website couldn’t load.
        </p>
        <div className="mt-3">
          <Button variant="quiet" onClick={() => void overview.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  const { look, pages } = overview.data;

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
            Website
          </h1>
          <p className="mt-1 mb-0 text-sm text-(--muted)">
            Pages built from ready sections, in a theme you can switch at any
            time without losing a word.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} weight="bold" />
          Add a page
        </Button>
      </header>

      <section className={surfaceClass} aria-label="Theme">
        <div className={`border-b ${dividerClass} px-4 py-3 sm:px-7 sm:py-5`}>
          <h2 className="m-0 text-base font-bold tracking-tight text-(--text) sm:text-lg">
            Theme
          </h2>
          <p className="mt-0.5 mb-0 text-xs text-(--muted)">
            Colours, fonts and shapes for every page. Live pages change right
            away; your words stay as they are.
          </p>
        </div>
        <div className="p-4 sm:p-7">
          <WebsiteThemePicker
            look={look}
            onChange={changeLook}
            isSaving={saveLook.isPending}
          />
          {lookError ? (
            <p className="mt-3 mb-0 text-sm text-rose-500">{lookError}</p>
          ) : null}
        </div>
      </section>

      <section className={surfaceClass} aria-label="Pages">
        <div className={`border-b ${dividerClass} px-4 py-3 sm:px-7 sm:py-5`}>
          <h2 className="m-0 text-base font-bold tracking-tight text-(--text) sm:text-lg">
            Pages
          </h2>
          <p className="mt-0.5 mb-0 text-xs text-(--muted)">
            Changes are saved as a draft until you publish them.
          </p>
        </div>
        {pages.length === 0 ? (
          <div className="grid place-items-center p-8 text-center sm:p-14">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-(--accent)/10 text-(--accent)">
              <Browser size={24} weight="bold" />
            </span>
            <h3 className="mt-3 mb-0 text-base font-semibold text-(--text)">
              Make your first page
            </h3>
            <p className="mt-1 mb-0 max-w-sm text-[13px] leading-5 text-(--muted)">
              Start from a home page, a landing page or a link in bio. Your
              published courses fill in by themselves.
            </p>
            <div className="mt-4">
              <Button onClick={() => setAdding(true)}>
                <Plus size={16} weight="bold" />
                Add a page
              </Button>
            </div>
          </div>
        ) : (
          <ul
            className={`m-0 list-none divide-y p-0 divide-[color-mix(in_srgb,var(--text)_8%,transparent)]`}
          >
            {pages.map((page) => (
              <PageRow
                key={page.id}
                page={page}
                onOpen={() => onNavigatePage?.(websitePagePath(page.id))}
                onDelete={() => setDeleting(page)}
              />
            ))}
          </ul>
        )}
      </section>

      {adding ? (
        <NewPageDialog
          isOpen
          onClose={() => setAdding(false)}
          onCreated={(pageId) => {
            setAdding(false);
            onNavigatePage?.(websitePagePath(pageId));
          }}
        />
      ) : null}
      <ConfirmDeleteModal
        isOpen={deleting !== null}
        title={`Delete “${deleting?.title ?? ""}”?`}
        message="The page, its draft and every version are deleted. Buttons that pointed to it are left out of other pages."
        confirmLabel="Delete page"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setNotice?.("Page deleted.");
            },
          });
        }}
      />
    </main>
  );
}

const PAGE_PATH = /^\/website\/pages\/([0-9a-f-]{36})\/?$/u;

/** Website: the theme and pages list, or one page's editor. */
export function WebsitePage({ onNavigatePage, setNotice }: WebsitePageProps) {
  const location = useLocation();
  const { can, isLoading } = useCapabilities();
  if (isLoading)
    return <CenteredLoadingSpinner label="Loading" className="min-h-80" />;
  if (!can("platform.settings.update")) {
    return <AccessDenied onNavigatePage={onNavigatePage} />;
  }
  const pageId = PAGE_PATH.exec(location.pathname)?.[1];
  if (pageId) {
    return (
      <Suspense
        fallback={
          <CenteredLoadingSpinner
            label="Opening the editor"
            className="min-h-80"
          />
        }
      >
        <WebsiteEditor
          pageId={pageId}
          onNavigatePage={onNavigatePage}
          setNotice={setNotice}
        />
      </Suspense>
    );
  }
  return <WebsiteHome onNavigatePage={onNavigatePage} setNotice={setNotice} />;
}

export { WEBSITE_PATH };
