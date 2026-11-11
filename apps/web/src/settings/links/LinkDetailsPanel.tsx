import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { ShortLink } from "@veolms/contracts";
import { useState, type ReactNode } from "react";

import { Button } from "../../components/Button";
import {
  SlideOverPanel,
  SlideOverStepButtons,
} from "../../components/SlideOverPanel";
import { TimeAgo } from "../../components/TimeAgo";
import { ConfirmDeleteModal } from "../../ConfirmDeleteModal";
import { getApiError } from "../../lib/api-error";
import { useDeleteShortLink, useUpdateShortLink } from "../../services/links";
import { LinkStatusBadge, LinkTypeBadge, useCopiedText } from "./LinkBadges";
import { LinkForm } from "./LinkForm";
import { formatLinkDate, linkAddress, linkIconButtonClass } from "./linkStyles";

const sectionLabel =
  "mb-1.5 text-[11px] font-bold tracking-wider text-(--muted) uppercase";

function AddressRow({
  label,
  href,
  copied,
  onCopy,
}: {
  label: string;
  href: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <p className={sectionLabel}>{label}</p>
      <div className="flex items-center gap-1 rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] py-1 pr-1 pl-3">
        <span
          className="min-w-0 flex-1 truncate font-mono text-sm text-(--text)"
          title={href}
        >
          {href}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
          title={copied ? "Copied" : "Copy"}
          className={linkIconButtonClass}
        >
          {copied ? (
            <Check size={16} weight="bold" className="text-(--success)" />
          ) : (
            <Copy size={16} weight="bold" />
          )}
        </button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label}`}
          title="Open in a new tab"
          className={linkIconButtonClass}
        >
          <ArrowSquareOut size={16} weight="bold" />
        </a>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--card-surface) p-3">
      <p className="text-[11px] font-bold tracking-wider text-(--muted) uppercase">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-(--text)">{children}</div>
    </div>
  );
}

/**
 * A link's details in the drawer, as a student's are: its addresses, visits
 * and who made it; pause or resume, edit (the form takes the drawer's
 * place) and delete. The previous and next buttons step through the table.
 */
export function LinkDetailsPanel({
  link,
  editing,
  onEdit,
  onEditDone,
  onClose,
  step,
}: {
  link: ShortLink;
  editing: boolean;
  onEdit: () => void;
  onEditDone: () => void;
  onClose: () => void;
  step: {
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateShortLink();
  const remove = useDeleteShortLink();
  const { copied, copy } = useCopiedText();
  const address = linkAddress(link);

  const toggleActive = () => {
    setError(null);
    update.mutate(
      { id: link.id, body: { isActive: !link.isActive } },
      { onError: (caught) => setError(getApiError(caught).message) },
    );
  };

  return (
    <SlideOverPanel
      label={`Link ${link.path}`}
      title={<span className="font-mono">{link.path}</span>}
      onClose={onClose}
      headerActions={
        editing ? null : <SlideOverStepButtons {...step} noun="link" />
      }
      headerContent={
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LinkTypeBadge link={link} />
          <LinkStatusBadge isActive={link.isActive} />
        </div>
      }
    >
      {editing ? (
        <LinkForm
          key={link.id}
          link={link}
          onCancel={onEditDone}
          onSaved={onEditDone}
        />
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
            <AddressRow
              label="Short address"
              href={address}
              copied={copied === "address"}
              onCopy={() => void copy("address", address)}
            />
            <AddressRow
              label="Destination"
              href={link.destination}
              copied={copied === "destination"}
              onCopy={() => void copy("destination", link.destination)}
            />
            {link.mode === "rewrite" && (
              <p className="-mt-2 text-xs text-(--muted)">
                Visitors see the destination&apos;s page at the short address;
                it runs sandboxed, apart from this site.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Visits">
                <span className="font-mono">
                  {link.visitCount.toLocaleString()}
                </span>
              </Stat>
              <Stat label="Last visit">
                {link.lastVisitedAt ? (
                  <TimeAgo value={link.lastVisitedAt} />
                ) : (
                  <span className="text-(--muted)">Never</span>
                )}
              </Stat>
              <Stat label="Created">
                {formatLinkDate(link.createdAt)}
                {link.createdBy?.name && (
                  <span className="block truncate text-xs font-normal text-(--muted)">
                    by {link.createdBy.name}
                  </span>
                )}
              </Stat>
              <Stat label="Last changed">
                <TimeAgo value={link.updatedAt} />
              </Stat>
            </div>

            {error && (
              <p role="alert" className="text-sm font-semibold text-rose-500">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-4 sm:px-6">
            <Button
              variant="danger"
              className="h-10 gap-1.5 rounded-[10px] px-3 text-sm font-semibold"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash size={16} weight="bold" aria-hidden />
              Delete
            </Button>
            <span className="flex-1" />
            <Button
              variant="quiet"
              className="h-10 gap-1.5 rounded-[10px] px-3 text-sm font-semibold"
              disabled={update.isPending}
              onClick={toggleActive}
            >
              {link.isActive ? (
                <Pause size={16} weight="bold" aria-hidden />
              ) : (
                <Play size={16} weight="bold" aria-hidden />
              )}
              {link.isActive ? "Pause" : "Resume"}
            </Button>
            <Button
              className="h-10 gap-1.5 rounded-[10px] px-4 text-sm font-semibold"
              onClick={onEdit}
            >
              <PencilSimple size={16} weight="bold" aria-hidden />
              Edit
            </Button>
          </div>
        </>
      )}

      <ConfirmDeleteModal
        isOpen={confirmingDelete}
        title={`Delete ${link.path}?`}
        message="The address stops working at once. This cannot be undone."
        confirmLabel="Delete link"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          remove.mutate(link.id, {
            onSuccess: onClose,
            onError: (caught) => setError(getApiError(caught).message),
          });
        }}
      />
    </SlideOverPanel>
  );
}
