import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import type { ShortLink } from "@veolms/contracts";
import { useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { ElevatedCard } from "../../components/ElevatedCard";
import { CenteredLoadingSpinner } from "../../components/LoadingSpinner";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { getApiError } from "../../lib/api-error";
import { useCapabilities } from "../../services/authorization";
import { useShortLinks } from "../../services/links";
import { LinkDetailsPanel } from "./LinkDetailsPanel";
import { LinkFiltersBar } from "./LinkFiltersBar";
import { LinkForm } from "./LinkForm";
import {
  DEFAULT_LINK_FILTERS,
  filterLinks,
  type LinkFilters,
} from "./linkFilters";
import { siteHost } from "./linkStyles";
import { LinksTable } from "./LinksTable";

type Drawer =
  { kind: "new" } | { kind: "details"; id: string; editing: boolean } | null;

function Summary({ links }: { links: readonly ShortLink[] }) {
  const active = links.filter((link) => link.isActive).length;
  const visits = links.reduce((total, link) => total + link.visitCount, 0);
  const items = [
    ["Links", links.length],
    ["Active", active],
    ["Paused", links.length - active],
    ["Visits", visits],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <ElevatedCard key={label} as="div" className="px-4 py-3">
          <dt className="text-[11px] font-bold tracking-wider text-(--muted) uppercase">
            {label}
          </dt>
          <dd className="mt-0.5 font-mono text-xl font-bold text-(--text)">
            {value.toLocaleString()}
          </dd>
        </ElevatedCard>
      ))}
    </dl>
  );
}

const newLinkButtonClass =
  "h-10 gap-1.5 rounded-[10px] px-4 text-sm font-semibold";

/**
 * Settings > Links: short addresses on the site's own domain that redirect
 * to, or show, another page (docs/short-links.md). For staff with
 * `link.manage`. A table with search and filters; a link's details, edit
 * form and the new-link form open in a drawer, as a student's do.
 */
export function LinksSettings({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const capabilities = useCapabilities({ enabled: isAuthenticated });
  const allowed = isAuthenticated && capabilities.can("link.manage");
  const links = useShortLinks({ enabled: allowed });
  const [filters, setFilters] = useState<LinkFilters>(DEFAULT_LINK_FILTERS);
  const [drawer, setDrawer] = useState<Drawer>(null);

  const all = links.data?.links;
  const shown = useMemo(
    () => (all ? filterLinks(all, filters) : []),
    [all, filters],
  );

  if (!capabilities.isFetched && isAuthenticated) {
    return <CenteredLoadingSpinner label="Loading links" />;
  }
  if (!allowed) {
    return (
      <ElevatedCard as="p" className="p-5 text-sm text-(--muted)">
        Links are managed by the academy&apos;s staff.
      </ElevatedCard>
    );
  }

  const openLink =
    drawer?.kind === "details"
      ? all?.find((link) => link.id === drawer.id)
      : undefined;
  const openIndex = openLink ? shown.indexOf(openLink) : -1;
  const stepTo = (index: number) => {
    const next = shown[index];
    if (next) setDrawer({ kind: "details", id: next.id, editing: false });
  };
  const openNew = () => setDrawer({ kind: "new" });

  return (
    <div className="flex flex-col gap-5" aria-label="Links">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--accent)/12 text-(--accent)">
            <LinkSimple size={22} weight="duotone" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold text-(--text)">Links</h2>
            <p className="text-sm text-(--muted)">
              Short addresses on {siteHost() || "this site"} that send visitors
              to another page, or show it here.
            </p>
          </div>
        </div>
        <Button className={newLinkButtonClass} onClick={openNew}>
          <Plus size={16} weight="bold" aria-hidden />
          New link
        </Button>
      </header>

      {links.isPending ? (
        <CenteredLoadingSpinner label="Loading links" />
      ) : links.isError ? (
        <p role="alert" className="text-sm text-rose-500">
          {getApiError(links.error).message}
        </p>
      ) : links.data.links.length === 0 ? (
        <ElevatedCard
          as="div"
          className="flex flex-col items-center gap-3 px-6 py-10 text-center"
        >
          <LinkSimple size={32} weight="duotone" className="text-(--accent)" />
          <p className="text-sm text-(--muted)">
            No links yet. Make one such as /nodejs for a course&apos;s syllabus.
          </p>
          <Button className={newLinkButtonClass} onClick={openNew}>
            <Plus size={16} weight="bold" aria-hidden />
            New link
          </Button>
        </ElevatedCard>
      ) : (
        <>
          <Summary links={links.data.links} />
          <LinkFiltersBar filters={filters} onChange={setFilters} />
          {shown.length === 0 ? (
            <ElevatedCard
              as="p"
              className="p-6 text-center text-sm text-(--muted)"
            >
              No links match the search and filters.
            </ElevatedCard>
          ) : (
            <LinksTable
              links={shown}
              onOpen={(link) =>
                setDrawer({ kind: "details", id: link.id, editing: false })
              }
            />
          )}
        </>
      )}

      {drawer?.kind === "new" && (
        <SlideOverPanel
          label="New link"
          title="New link"
          onClose={() => setDrawer(null)}
        >
          <LinkForm
            onCancel={() => setDrawer(null)}
            onSaved={(saved) =>
              setDrawer({ kind: "details", id: saved.id, editing: false })
            }
          />
        </SlideOverPanel>
      )}

      {drawer?.kind === "details" && openLink && (
        <LinkDetailsPanel
          link={openLink}
          editing={drawer.editing}
          onEdit={() => setDrawer({ ...drawer, editing: true })}
          onEditDone={() => setDrawer({ ...drawer, editing: false })}
          onClose={() => setDrawer(null)}
          step={{
            hasPrev: openIndex > 0,
            hasNext: openIndex >= 0 && openIndex < shown.length - 1,
            onPrev: () => stepTo(openIndex - 1),
            onNext: () => stepTo(openIndex + 1),
          }}
        />
      )}
    </div>
  );
}
