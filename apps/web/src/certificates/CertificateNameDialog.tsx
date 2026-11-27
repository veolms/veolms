import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

import { Button } from "../components/Button";
import { useBackDismiss } from "../navigation/useBackDismiss";

const PROFILE_SETTINGS_PATH = "/settings/profile";

/**
 * Confirms the name a certificate will carry. The learner never types it:
 * it is the name on their profile, read by the server. A name that cannot
 * be printed (another alphabet, digits) sends them to their profile to fix
 * it; so does wanting a different name.
 *
 * `mode` "claim" issues the certificate; "update" puts the profile's
 * current name on a certificate already issued (`currentName`).
 */
export function CertificateNameDialog({
  open,
  mode,
  courseTitle,
  name,
  currentName,
  problem,
  correctionsLeft,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  mode: "claim" | "update";
  courseTitle: string;
  /** The profile name, as it will be printed. */
  name: string;
  /** The name printed now (mode "update"). */
  currentName?: string;
  /** Why the profile name cannot be printed, or null. */
  problem: string | null;
  correctionsLeft?: number;
  pending: boolean;
  /** The server's answer when it refused. */
  error?: string | null;
  onCancel: () => void;
  /**
   * `closeThen` closes the dialog and runs `after` once its Back-button
   * history entry is gone: navigate from there, never right after closing.
   */
  onConfirm: (closeThen: (after: () => void) => void) => void;
}) {
  const titleId = useId();
  const closeThen = useBackDismiss({ open, onDismiss: onCancel });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, open, pending]);

  if (!open) return null;

  const unchanged = mode === "update" && name === currentName;
  const blocked = Boolean(problem) || unchanged;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs [animation:deleteModalFadeIn_0.18s_ease-out]"
      onClick={pending ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="relative w-full max-w-[460px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[480px]:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id={titleId}
              className="m-0 text-[1.1rem] font-bold tracking-tight text-(--text)"
            >
              {mode === "claim"
                ? "Claim your certificate"
                : "Update the name on your certificate"}
            </h3>
            <p className="m-0 mt-1 text-[0.82rem] text-(--muted)">
              {courseTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text) disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {mode === "update" && currentName ? (
          <p className="m-0 mb-2 text-[0.82rem] text-(--muted)">
            Now printed: <span className="text-(--text)">{currentName}</span>
          </p>
        ) : null}
        <div className="rounded-xl border border-dashed border-[color-mix(in_srgb,#c59a2e_55%,transparent)] bg-[color-mix(in_srgb,#c59a2e_7%,transparent)] px-4 py-3 text-center">
          <p className="m-0 text-[0.68rem] font-semibold tracking-[0.12em] text-(--muted) uppercase">
            Proudly presented to
          </p>
          <p className="m-0 mt-1 min-h-8 truncate font-serif text-[1.45rem] leading-8 font-bold text-[#b8861f] italic">
            {name || " "}
          </p>
        </div>

        <p
          className={`m-0 mt-3 text-[0.8rem] ${problem ? "text-rose-500" : "text-(--muted)"}`}
          role={problem ? "alert" : undefined}
        >
          {problem
            ? `Your profile name can't be printed. ${problem}`
            : unchanged
              ? "This is already the name on your certificate. Change it in your profile first."
              : mode === "claim"
                ? "This is the name on your profile. To print a different name, change it in your profile first."
                : `The certificate's link stays the same. You can do this ${correctionsLeft ?? 0} more time${correctionsLeft === 1 ? "" : "s"}.`}
        </p>
        <Link
          to={PROFILE_SETTINGS_PATH}
          className="mt-1 inline-flex items-center gap-1 text-[0.82rem] font-semibold text-(--accent) no-underline hover:underline"
        >
          Edit your profile name
          <ArrowRight size={13} weight="bold" aria-hidden="true" />
        </Link>

        {error ? (
          <p className="m-0 mt-3 text-[0.82rem] text-rose-500" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(closeThen)}
            disabled={pending || blocked}
          >
            {pending
              ? mode === "claim"
                ? "Issuing…"
                : "Updating…"
              : mode === "claim"
                ? "Claim certificate"
                : "Update name"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
