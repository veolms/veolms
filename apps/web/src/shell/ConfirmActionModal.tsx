import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../components/Button";
import {
  loginButtonClasses,
  loginCardCornerButtonClasses,
} from "../auth/LoginCardParts";
import { cn } from "../lib/utils";
import { useBackDismiss } from "../navigation/useBackDismiss";

type ModalIconWeight = "bold" | "duotone" | "fill" | "regular";

type ModalIcon = ComponentType<{
  size?: number;
  weight?: ModalIconWeight;
}>;

export interface ConfirmActionModalProps {
  id: string;
  isOpen: boolean;
  isPending?: boolean;
  /**
   * Holds the confirming button back until the caller is satisfied, for an
   * action that asks for more than a click (a phrase typed in the
   * description, say).
   */
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  icon: ModalIcon;
  /** Defaults to the two-tone style; pass "regular" for a plain outline. */
  iconWeight?: ModalIconWeight;
  title: string;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel: string;
  tone?: "accent" | "danger";
  /**
   * Which button is the highlighted one, shown last. Defaults to the
   * confirming button; "cancel" highlights the safe choice instead and puts
   * the confirming button first, unhighlighted.
   */
  emphasis?: "confirm" | "cancel";
  /**
   * Close first, then confirm: for an action that takes effect elsewhere
   * (signing out moves the page on). The dialog's Back-button history entry
   * is gone by the time `onConfirm` runs, so stepping it back cannot undo a
   * navigation the action starts.
   */
  closeOnConfirm?: boolean;
  /**
   * Form fields under the description, for an action that needs a few
   * values. The first field takes focus when the dialog opens, and Enter in
   * a field confirms.
   */
  children?: ReactNode;
  /**
   * "loginCard": the login pop-up's look (see auth/LoginCardParts): a large
   * title over one quiet line, the confirming button full width with the
   * accent's fill and the other quieter under it, the close in the corner.
   * For a short question that needs no fields.
   */
  appearance?: "default" | "loginCard";
}

const ACTION_BUTTON_CLASS =
  "min-w-32 flex-1 font-bold! sm:flex-none max-[480px]:w-full";

const QUIET_ACTION_BUTTON_CLASS =
  "bg-(--surface-strong)! text-(--text-secondary)! shadow-none! hover:bg-(--hover)! hover:text-(--text)!";

export function ConfirmActionModal({
  id,
  isOpen,
  isPending = false,
  confirmDisabled = false,
  onClose,
  onConfirm,
  icon: Icon,
  iconWeight = "duotone",
  title,
  description,
  cancelLabel,
  confirmLabel,
  pendingLabel,
  tone = "accent",
  emphasis = "confirm",
  closeOnConfirm = false,
  children,
  appearance = "default",
}: ConfirmActionModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fieldsRef = useRef<HTMLFormElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const isDanger = tone === "danger";
  const cancelEmphasized = emphasis === "cancel";

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

      // In page order: the close button, any fields, then the two actions.
      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<
          HTMLButtonElement | HTMLInputElement
        >("button, input") ?? [],
      ).filter((element) => !element.disabled);

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
      () =>
        (
          fieldsRef.current?.querySelector<HTMLInputElement>("input") ??
          cancelBtnRef.current
        )?.focus(),
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

  const cancelButton = (
    <Button
      key="cancel"
      ref={cancelBtnRef}
      motion="static"
      className={`${ACTION_BUTTON_CLASS}${cancelEmphasized ? "" : ` ${QUIET_ACTION_BUTTON_CLASS}`}`}
      onClick={dismissModal}
      disabled={isPending}
    >
      {cancelLabel}
    </Button>
  );
  const confirmButton = (
    <Button
      key="confirm"
      ref={confirmBtnRef}
      motion="static"
      className={`${ACTION_BUTTON_CLASS}${cancelEmphasized ? ` ${QUIET_ACTION_BUTTON_CLASS}` : ""}`}
      onClick={closeOnConfirm ? () => dismissThen(onConfirm) : onConfirm}
      disabled={isPending || confirmDisabled}
      aria-busy={isPending}
    >
      {isPending && <CircleNotch size={15} className="animate-spin" />}
      {isPending ? pendingLabel : confirmLabel}
    </Button>
  );

  if (appearance === "loginCard") {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={dismissModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div
          ref={dialogRef}
          className="relative w-full max-w-95 rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) px-[clamp(20px,6vw,28px)] pt-7 pb-6 text-(--text) animate-in zoom-in-95 duration-150"
          style={{
            boxShadow: "var(--card-floating-shadow,var(--card-shadow))",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            ref={closeBtnRef}
            type="button"
            className={cn(loginCardCornerButtonClasses, "right-3.5")}
            onClick={dismissModal}
            disabled={isPending}
            aria-label="Close dialog"
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-[14px]",
              iconClassName,
            )}
            aria-hidden="true"
          >
            <Icon size={24} weight={iconWeight} />
          </div>
          <h2
            id={titleId}
            className="mt-5 mb-0 text-2xl leading-7.5 font-bold tracking-[-0.3px] text-(--text)"
          >
            {title}
          </h2>
          <p
            id={descriptionId}
            className="mt-1.5 mb-0 text-[0.9375rem] leading-5.5 text-(--muted)"
          >
            {description}
          </p>
          <div className="mt-7 flex flex-col gap-2.5">
            <button
              ref={confirmBtnRef}
              type="button"
              className={cn(
                loginButtonClasses.base,
                isDanger
                  ? "border-0 bg-(--danger) text-white hover:bg-[color-mix(in_srgb,var(--danger)_88%,black)] disabled:opacity-70"
                  : loginButtonClasses.primary,
              )}
              onClick={
                closeOnConfirm ? () => dismissThen(onConfirm) : onConfirm
              }
              disabled={isPending || confirmDisabled}
              aria-busy={isPending}
            >
              {isPending ? (
                <CircleNotch
                  size={16}
                  weight="bold"
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : null}
              {isPending ? pendingLabel : confirmLabel}
            </button>
            <button
              ref={cancelBtnRef}
              type="button"
              className={cn(
                loginButtonClasses.base,
                loginButtonClasses.secondary,
              )}
              onClick={dismissModal}
              disabled={isPending}
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={dismissModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        ref={dialogRef}
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
              <Icon size={21} weight={iconWeight} />
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

        {children ? (
          <form
            ref={fieldsRef}
            className="mt-4 flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!isPending && !confirmDisabled) onConfirm();
            }}
          >
            {children}
            {/* Lets Enter in a field submit the form. */}
            <button type="submit" hidden tabIndex={-1} />
          </form>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2.5 max-[480px]:flex-col-reverse">
          {cancelEmphasized
            ? [confirmButton, cancelButton]
            : [cancelButton, confirmButton]}
        </div>
      </div>
    </div>,
    document.body,
  );
}
