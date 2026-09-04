import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "../navigation/useBackDismiss";

type ModalIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "regular";
}>;

export interface ConfirmActionModalProps {
  id: string;
  isOpen: boolean;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  icon: ModalIcon;
  title: string;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel: string;
  tone?: "accent" | "danger";
}

export function ConfirmActionModal({
  id,
  isOpen,
  isPending = false,
  onClose,
  onConfirm,
  icon: Icon,
  title,
  description,
  cancelLabel,
  confirmLabel,
  pendingLabel,
  tone = "accent",
}: ConfirmActionModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const isDanger = tone === "danger";

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
    const focusTimer = window.setTimeout(
      () => cancelBtnRef.current?.focus(),
      50,
    );

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      previousActiveElement?.focus();
    };
  }, [dismissModal, isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const iconClassName = isDanger
    ? "bg-[color-mix(in_srgb,var(--danger)_10%,var(--surface-strong))] text-(--danger)"
    : "bg-(--accent-soft) text-(--accent-ink,var(--accent))";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={dismissModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        className="relative w-full max-w-md rounded-[20px] border border-(--border) bg-(--card-surface,var(--surface)) p-6 text-(--text) shadow-2xl animate-in zoom-in-95 duration-150"
        style={{ boxShadow: "var(--card-floating-shadow,var(--card-shadow))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
              aria-hidden="true"
            >
              <Icon size={21} weight="duotone" />
            </div>
            <h3
              id={titleId}
              className="min-w-0 text-lg font-bold tracking-tight text-(--text)"
            >
              {title}
            </h3>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-1.5 text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50"
            onClick={dismissModal}
            disabled={isPending}
            aria-label="Close dialog"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <p
          id={descriptionId}
          className="mt-4 mb-0 text-sm leading-6 text-(--text-secondary)"
        >
          {description}
        </p>

        <div className="mt-6 flex items-center justify-end gap-2.5 max-[480px]:flex-col-reverse">
          <button
            ref={cancelBtnRef}
            type="button"
            className="settings-action settings-action--quiet w-auto min-w-32 flex-1 sm:flex-none max-[480px]:w-full"
            onClick={dismissModal}
            disabled={isPending}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className="settings-action w-auto min-w-32 flex-1 sm:flex-none max-[480px]:w-full"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending && <CircleNotch size={15} className="animate-spin" />}
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
