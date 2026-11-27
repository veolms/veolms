import { XIcon as X } from "@phosphor-icons/react/X";
import type { StaffCertificate } from "@veolms/contracts";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../components/Button";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { certificateInputClass } from "./certificateUi";

/**
 * Asks why a certificate is being revoked. The reason stays with the staff;
 * the public page only says it was revoked, and when.
 */
export function RevokeCertificateDialog({
  certificate,
  pending,
  error,
  onCancel,
  onRevoke,
}: {
  certificate: StaffCertificate | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onRevoke: (reason: string) => void;
}) {
  const open = certificate !== null;
  const [reason, setReason] = useState("");
  const titleId = useId();
  const inputId = useId();
  useBackDismiss({ open, onDismiss: onCancel });

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, open, pending]);

  if (!certificate) return null;
  const trimmed = reason.trim();

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs [animation:deleteModalFadeIn_0.18s_ease-out]"
      onClick={pending ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <form
        className="relative w-full max-w-[440px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[480px]:p-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed && !pending) onRevoke(trimmed);
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id={titleId}
              className="m-0 text-[1.1rem] font-bold tracking-tight text-(--text)"
            >
              Revoke certificate
            </h3>
            <p className="m-0 mt-1 text-[0.82rem] text-(--muted)">
              {certificate.recipientName} · {certificate.displayCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>
        <p className="m-0 mb-4 text-[0.84rem] text-(--text-secondary)">
          Its page will say it was revoked and the learner can no longer
          download it. You can restore it later.
        </p>
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm font-semibold text-(--text)"
        >
          Reason (only staff see it)
        </label>
        <input
          id={inputId}
          className={certificateInputClass}
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Refunded, shared account, …"
          autoFocus
        />
        {error ? (
          <p className="m-0 mt-3 text-[0.82rem] text-rose-500" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!trimmed || pending}>
            {pending ? "Revoking…" : "Revoke"}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
