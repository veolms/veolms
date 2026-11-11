import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import type { ShortLink } from "@veolms/contracts";
import type { KeyboardEvent } from "react";

import { ElevatedCard } from "../../components/ElevatedCard";
import { TimeAgo } from "../../components/TimeAgo";
import { LinkStatusBadge, LinkTypeBadge, useCopiedText } from "./LinkBadges";
import {
  formatLinkDate,
  linkAddress,
  linkIconButtonClass,
  shortDestination,
} from "./linkStyles";

// One grid for the header and the rows, from the container's width (the
// table stacks into cards when the settings panel is narrow).
const columns =
  "@3xl/links:grid-cols-[minmax(170px,1.1fr)_minmax(200px,1.5fr)_minmax(130px,0.8fr)_minmax(90px,0.55fr)_minmax(110px,0.7fr)_minmax(120px,0.75fr)_88px]";

const cell = "min-w-0 @3xl/links:px-4 @3xl/links:py-3.5";

function LinkRow({
  link,
  copied,
  onCopy,
  onOpen,
}: {
  link: ShortLink;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}) {
  const open = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="row"
      tabIndex={0}
      aria-label={`Open details of ${link.path}`}
      onClick={onOpen}
      onKeyDown={open}
      className={`group relative flex cursor-pointer flex-col gap-2 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] p-4 transition-colors last:border-b-0 hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent) @3xl/links:grid @3xl/links:items-center @3xl/links:gap-0 @3xl/links:p-0 ${columns}`}
    >
      <div role="cell" className={`${cell} pr-20 @3xl/links:pl-5`}>
        <span
          className={`block truncate font-mono text-sm font-bold transition-colors group-hover:text-(--accent) ${
            link.isActive ? "text-(--text)" : "text-(--muted)"
          }`}
        >
          {link.path}
        </span>
      </div>

      <div role="cell" className={cell}>
        <span
          className="block truncate text-xs text-(--text-secondary)"
          title={link.destination}
        >
          {shortDestination(link.destination)}
        </span>
      </div>

      <div
        role="cell"
        className={`${cell} flex flex-wrap items-center gap-2 @3xl/links:block`}
      >
        <LinkTypeBadge link={link} />
        <span className="@3xl/links:hidden">
          <LinkStatusBadge isActive={link.isActive} />
        </span>
      </div>

      <div role="cell" className={`${cell} hidden @3xl/links:block`}>
        <LinkStatusBadge isActive={link.isActive} />
      </div>

      <div role="cell" className={`${cell} text-xs`}>
        <span className="font-mono font-semibold text-(--text)">
          {link.visitCount.toLocaleString()}
        </span>
        <span className="text-(--muted)">
          {" "}
          {link.visitCount === 1 ? "visit" : "visits"}
        </span>
        {link.lastVisitedAt && (
          <span className="block text-[11px] text-(--muted)">
            last <TimeAgo value={link.lastVisitedAt} />
          </span>
        )}
      </div>

      <div
        role="cell"
        className={`${cell} hidden text-xs text-(--muted) @3xl/links:block`}
      >
        {formatLinkDate(link.createdAt)}
        {link.createdBy?.name && (
          <span className="block truncate text-[11px]">
            by {link.createdBy.name}
          </span>
        )}
      </div>

      <div
        role="cell"
        className="absolute top-3 right-3 flex items-center justify-end gap-0.5 @3xl/links:static @3xl/links:pr-4"
      >
        <button
          type="button"
          aria-label={copied ? `Copied ${link.path}` : `Copy ${link.path}`}
          title={copied ? "Copied" : "Copy address"}
          onClick={(event) => {
            event.stopPropagation();
            onCopy();
          }}
          className={linkIconButtonClass}
        >
          {copied ? (
            <Check size={16} weight="bold" className="text-(--success)" />
          ) : (
            <Copy size={16} weight="bold" />
          )}
        </button>
        <span className={linkIconButtonClass} aria-hidden>
          <CaretRight size={16} weight="bold" />
        </span>
      </div>
    </div>
  );
}

/**
 * Every link in a table: address, destination, type, status, visits and
 * creation. A row opens the link's details; its copy button copies the
 * full address.
 */
export function LinksTable({
  links,
  onOpen,
}: {
  links: readonly ShortLink[];
  onOpen: (link: ShortLink) => void;
}) {
  const { copied, copy } = useCopiedText();

  return (
    <ElevatedCard as="div" className="overflow-hidden">
      <div className="@container/links">
        <div role="table" aria-label="Links" aria-rowcount={links.length}>
          <div
            role="row"
            className={`hidden border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold tracking-wider text-(--muted) uppercase select-none @3xl/links:grid ${columns}`}
          >
            <div role="columnheader" className="px-5 py-3.5">
              Short link
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Destination
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Type
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Status
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Visits
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Created
            </div>
            <div role="columnheader" className="px-4 py-3.5 text-right">
              <span className="sr-only">Actions</span>
            </div>
          </div>
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              copied={copied === link.id}
              onCopy={() => void copy(link.id, linkAddress(link))}
              onOpen={() => onOpen(link)}
            />
          ))}
        </div>
      </div>
    </ElevatedCard>
  );
}
