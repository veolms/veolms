import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { ShortLink } from "@veolms/contracts";
import { useState, type ComponentType } from "react";

import { ConfirmDeleteModal } from "../../ConfirmDeleteModal";
import { getApiError } from "../../lib/api-error";
import { useDeleteShortLink, useUpdateShortLink } from "../../services/links";
import { LinkForm } from "./LinkForm";
import { linkBadgeClass, linkCardClass, siteOrigin } from "./linkStyles";

function RowAction({
  label,
  Icon,
  onClick,
  tone = "default",
  disabled,
}: {
  label: string;
  Icon: ComponentType<{ size?: number; weight?: "bold" | "regular" }>;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-lg transition-colors disabled:opacity-50 ${
        tone === "danger"
          ? "text-rose-500 hover:bg-rose-500/12"
          : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
      }`}
    >
      <Icon size={16} weight="bold" />
    </button>
  );
}

/** One link in the list: copy, edit, pause or resume, delete. */
export function LinkRow({ link }: { link: ShortLink }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const update = useUpdateShortLink();
  const remove = useDeleteShortLink();
  const fullAddress = `${siteOrigin()}${link.path}`;

  if (editing) return <LinkForm link={link} onDone={() => setEditing(false)} />;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullAddress);
      setNotice("Copied");
    } catch {
      setNotice("Could not copy");
    }
    window.setTimeout(() => setNotice(null), 1600);
  };

  const toggleActive = () =>
    update.mutate(
      { id: link.id, body: { isActive: !link.isActive } },
      { onError: (error) => setNotice(getApiError(error).message) },
    );

  return (
    <li
      className={`${linkCardClass} flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={fullAddress}
            target="_blank"
            rel="noreferrer"
            className={`font-semibold break-all ${link.isActive ? "text-(--text)" : "text-(--muted) line-through"}`}
          >
            {link.path}
          </a>
          <span className={linkBadgeClass}>
            {link.mode === "rewrite"
              ? "Shown here"
              : `Redirect ${link.redirectStatus}`}
          </span>
          {!link.isActive && <span className={linkBadgeClass}>Paused</span>}
          {notice && (
            <span
              role="status"
              className="text-xs font-semibold text-(--accent)"
            >
              {notice}
            </span>
          )}
        </div>
        <p
          className="mt-0.5 truncate text-xs text-(--muted)"
          title={link.destination}
        >
          → {link.destination}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-xs text-(--muted)">
          {link.visitCount.toLocaleString()}{" "}
          {link.visitCount === 1 ? "visit" : "visits"}
        </span>
        <div className="flex items-center gap-0.5">
          <RowAction
            label={`Copy ${link.path}`}
            Icon={Copy}
            onClick={() => void copy()}
          />
          <RowAction
            label={`Edit ${link.path}`}
            Icon={PencilSimple}
            onClick={() => setEditing(true)}
          />
          <RowAction
            label={link.isActive ? `Pause ${link.path}` : `Resume ${link.path}`}
            Icon={link.isActive ? Pause : Play}
            onClick={toggleActive}
            disabled={update.isPending}
          />
          <RowAction
            label={`Delete ${link.path}`}
            Icon={Trash}
            tone="danger"
            onClick={() => setConfirmingDelete(true)}
          />
        </div>
      </div>
      <ConfirmDeleteModal
        isOpen={confirmingDelete}
        title={`Delete ${link.path}?`}
        message="The address stops working at once. This cannot be undone."
        confirmLabel="Delete link"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          remove.mutate(link.id, {
            onError: (error) => setNotice(getApiError(error).message),
          });
        }}
      />
    </li>
  );
}
