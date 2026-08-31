import { TrashIcon as Trash, XIcon as X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "./navigation/useBackDismiss";

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  holdDurationMs?: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  title = "Delete Confirmation",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  holdDurationMs = 1200,
  onConfirm,
  onClose,
}: ConfirmDeleteModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const dismissThen = useBackDismiss({ open: isOpen, onDismiss: onClose });
  const dismissModal = useCallback(
    () => dismissThen(() => {}),
    [dismissThen],
  );

  const holdTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const resetHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    startTimeRef.current = null;
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const triggerConfirm = useCallback(() => {
    resetHold();
    dismissThen(onConfirm);
  }, [dismissThen, onConfirm, resetHold]);

  const startHold = useCallback(() => {
    if (holdTimerRef.current !== null) return;
    setIsHolding(true);
    startTimeRef.current = performance.now();

    const update = (now: number) => {
      if (!startTimeRef.current) return;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / holdDurationMs);
      setHoldProgress(progress);

      if (progress >= 1) {
        triggerConfirm();
      } else {
        holdTimerRef.current = requestAnimationFrame(update);
      }
    };

    holdTimerRef.current = requestAnimationFrame(update);
  }, [holdDurationMs, triggerConfirm]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousActiveElement =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        resetHold();
        dismissModal();
        return;
      }

      if (e.key === "Tab") {
        const focusableElements = [
          closeBtnRef.current,
          cancelBtnRef.current,
          confirmBtnRef.current,
        ].filter((el): el is HTMLButtonElement => el !== null);

        if (!focusableElements.length) return;
        const first = focusableElements[0]!;
        const last = focusableElements[focusableElements.length - 1]!;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    resetHold();

    const focusTimer = window.setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      resetHold();
      previousActiveElement?.focus();
    };
  }, [dismissModal, isOpen, resetHold]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="delete-modal-overlay"
      onClick={dismissModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-description"
    >
      <div
        className="delete-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          ref={closeBtnRef}
          type="button"
          className="delete-modal-close"
          onClick={dismissModal}
          aria-label="Close dialog"
        >
          <X size={15} weight="bold" />
        </button>

        {/* Header with Icon and Text */}
        <div className="flex items-start gap-4 pr-7 mb-5.5">
          <div
            className="flex w-11 h-11 items-center justify-center rounded-xl text-red-400 bg-red-500/12 border border-red-500/20 shadow-[0_2px_12px_rgba(239,68,68,0.16)] shrink-0"
            aria-hidden="true"
          >
            <Trash size={20} weight="duotone" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3
              id="delete-modal-title"
              className="m-0 mb-1.5 text-(--text) text-[1.1rem] font-bold tracking-[-0.015em] leading-snug break-words"
            >
              {title}
            </h3>
            <p
              id="delete-modal-description"
              className="m-0 text-(--muted) text-[0.86rem] leading-[1.5] break-words"
            >
              {message}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 max-[480px]:flex-col-reverse max-[480px]:w-full max-[480px]:gap-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            className="delete-modal-cancel"
            onClick={dismissModal}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className="delete-modal-confirm"
            onMouseDown={startHold}
            onMouseUp={resetHold}
            onMouseLeave={resetHold}
            onTouchStart={startHold}
            onTouchEnd={resetHold}
            onTouchCancel={resetHold}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!isHolding) startHold();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                resetHold();
              }
            }}
            aria-label={`Hold to ${confirmLabel}`}
          >
            {/* Smooth Fill Progress Bar */}
            <span
              className="delete-modal-progress"
              style={{
                transform: `scaleX(${holdProgress})`,
                transition: isHolding ? "none" : "transform 0.15s ease-out",
              }}
              aria-hidden="true"
            />
            <span className="relative z-10 inline-flex items-center gap-1.5 font-semibold">
              <Trash size={15} weight={isHolding ? "fill" : "bold"} />
              <span className="grid [grid-template-areas:'stack'] items-center text-center">
                <span
                  className={`[grid-area:stack] whitespace-nowrap transition-opacity duration-150 ${
                    isHolding ? "opacity-0 invisible pointer-events-none" : "opacity-100 visible"
                  }`}
                >
                  Hold to {confirmLabel}
                </span>
                <span
                  className={`[grid-area:stack] whitespace-nowrap transition-opacity duration-150 ${
                    isHolding ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
                  }`}
                >
                  Hold to Delete...
                </span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
