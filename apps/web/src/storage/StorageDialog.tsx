import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useBackDismiss } from "../navigation/useBackDismiss";

/** The note fields of the storage dialogs (as the refund request's). */
export const storageFieldClass =
  "mt-1.5 w-full resize-none rounded-xl border border-(--border) bg-(--canvas) px-3 py-2 text-sm text-(--text) outline-none placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

export const storageLabelClass =
  "block text-[0.82rem] font-semibold text-(--text-secondary)";

/**
 * The frame of the storage dialogs (asking for more space; an admin's
 * approve, limit and block forms), drawn as the app's confirm dialogs are:
 * closes on Escape, Back, the backdrop or the X.
 */
export function StorageDialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const titleId = useId();
  useBackDismiss({ open, onDismiss: onClose });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs [animation:deleteModalFadeIn_0.18s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="relative w-full max-w-[440px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[480px]:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id={titleId}
              className="m-0 text-[1.1rem] font-bold tracking-tight text-(--text)"
            >
              {title}
            </h3>
            {subtitle ? (
              <p className="m-0 mt-1 text-[0.82rem] text-(--muted)">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>
        {children}
        <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
