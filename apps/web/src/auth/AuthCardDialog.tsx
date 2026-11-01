import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useRef, type ReactNode } from "react";
import "./auth.css";
import { canOpenAsPopover, openWithoutBlocking } from "./authCardDialogOpening";
import {
  loginCardColumnClasses,
  loginCardCornerButtonClasses,
  loginCardFrameClasses,
} from "./LoginCardParts";

/**
 * The login card's pop-up frame, for any step shown as a card over the page
 * (signing in, verifying a mobile number before an enrolment): a modal
 * dialog with the card, its close button and a dimmed backdrop.
 *
 * The wrapper borrows the login screen's `auth-page` class for the spacing
 * and colour variables its card is written against, and switches off that
 * class's full-screen layout and patterned backdrop.
 */
export function AuthCardDialog({
  labelledBy,
  onClose,
  onOpened,
  children,
  ...dataAttributes
}: {
  labelledBy: string;
  onClose: () => void;
  /** Runs in the frame the dialog opens in. */
  onOpened?: () => void;
  children: ReactNode;
} & { [attribute: `data-${string}`]: string | boolean | undefined }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Whether the press that ends in a click began on the backdrop. Selecting
  // text by dragging, and letting go past the card's edge, ends in a click
  // on the backdrop too; only a press that began there closes.
  const pressBeganOnBackdropRef = useRef(false);
  const onOpenedRef = useRef(onOpened);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!canOpenAsPopover(dialog)) {
      if (!dialog.open) dialog.showModal();
      onOpenedRef.current?.();
      return () => dialog.close();
    }
    return openWithoutBlocking(dialog, {
      onOpened: () => onOpenedRef.current?.(),
      onEscape: () => onCloseRef.current(),
      onBackdropClick: () => onCloseRef.current(),
    });
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-modal="true"
      popover="manual"
      {...dataAttributes}
      // Escape asks to close; the owner decides.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // The card fills the dialog, so a click on the dialog itself is a
      // click on the backdrop around it.
      onPointerDown={(event) => {
        pressBeganOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const beganOnBackdrop = pressBeganOnBackdropRef.current;
        pressBeganOnBackdropRef.current = false;
        if (event.target === event.currentTarget && beganOnBackdrop) onClose();
      }}
      className="fixed inset-0 z-150 m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,420px)] max-w-none overflow-y-auto border-0 bg-transparent p-0 text-(--text) backdrop:bg-black/65 backdrop:backdrop-blur-xs sm:w-[min(92vw,460px)]"
    >
      <div className="auth-page min-h-0! bg-transparent! p-0! before:hidden!">
        <div className={`auth-page__container ${loginCardFrameClasses}`}>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`${loginCardCornerButtonClasses} right-3.5`}
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
          <div className={`auth-page__form-column ${loginCardColumnClasses}`}>
            {children}
          </div>
        </div>
      </div>
    </dialog>
  );
}
