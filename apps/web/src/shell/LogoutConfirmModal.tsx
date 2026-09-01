import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "../navigation/useBackDismiss";

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmModal({
  isOpen,
  isPending = false,
  onClose,
  onConfirm,
}: LogoutConfirmModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const dismissThen = useBackDismiss({
    enabled: !isPending,
    open: isOpen,
    onDismiss: onClose,
  });
  const dismissModal = useCallback(() => {
    if (isPending) return;
    dismissThen(() => {});
  }, [dismissThen, isPending]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousActiveElement =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissModal();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = [
        closeBtnRef.current,
        cancelBtnRef.current,
        confirmBtnRef.current,
      ].filter((element): element is HTMLButtonElement => element !== null);

      if (!focusableElements.length) return;
      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      previousActiveElement?.focus();
    };
  }, [dismissModal, isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-1500 flex items-center justify-center box-border p-5 bg-black/72 backdrop-blur-[10px] animate-[deleteModalFadeIn_0.18s_ease-out]"
      onClick={dismissModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      aria-describedby="logout-modal-description"
    >
      <div
        className="relative w-full max-w-[400px] overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-(--surface) px-6 pt-7 pb-6 text-(--text) shadow-[0_20px_48px_rgba(0,0,0,0.5),0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] animate-[deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className="pointer-events-none absolute inset-x-8 top-0 h-0.5 rounded-full bg-linear-to-r from-transparent via-(--accent) to-transparent"
          aria-hidden="true"
        />

        <button
          ref={closeBtnRef}
          type="button"
          className="absolute top-4 right-4 flex size-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-transparent p-0 text-(--muted) transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50"
          onClick={dismissModal}
          disabled={isPending}
          aria-label="Close dialog"
        >
          <X size={14} weight="bold" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div
            className="mb-4 flex size-14 items-center justify-center rounded-[17px] bg-(--accent-soft) text-(--accent-ink,var(--accent)) shadow-[0_8px_20px_color-mix(in_srgb,var(--accent-shadow)_28%,transparent)]"
            aria-hidden="true"
          >
            <SignOut size={26} weight="duotone" />
          </div>

          <h3
            id="logout-modal-title"
            className="m-0 text-[1.2rem] font-bold tracking-[-0.03em] leading-tight text-(--text)"
          >
            Sign out?
          </h3>
          <p
            id="logout-modal-description"
            className="mt-2 mb-0 max-w-70 text-[0.84rem] leading-[1.5] text-(--muted)"
          >
            This ends your session on this device. You can sign back in anytime
            to return to your courses and workspace.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2.5 max-[480px]:flex-col-reverse">
          <button
            ref={cancelBtnRef}
            type="button"
            className="inline-flex h-9.5 min-w-32 items-center justify-center rounded-[10px] border-0 bg-(--surface-strong) px-4 text-[0.78rem] font-bold text-(--text-secondary) transition duration-150 hover:bg-(--hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-62 max-[480px]:w-full max-[480px]:min-w-0"
            onClick={dismissModal}
            disabled={isPending}
          >
            Stay signed in
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className="inline-flex h-9.5 min-w-32 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-(--accent) px-4 text-[0.78rem] font-bold text-(--on-accent) shadow-[0_8px_18px_color-mix(in_srgb,var(--accent-shadow)_38%,transparent)] transition duration-150 hover:bg-(--accent-hover) hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-62 disabled:hover:translate-y-0 max-[480px]:w-full max-[480px]:min-w-0"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? (
              <CircleNotch size={15} className="animate-spin" />
            ) : (
              <SignOut size={15} weight="bold" />
            )}
            {isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
