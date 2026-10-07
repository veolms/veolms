import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useRef } from "react";
import "./auth.css";
import { AUTH_CARD_HEADING_ID } from "./authFlow";
import { LoginView } from "./LoginView";

/**
 * The login card as a pop-up over whatever page asked for it. It is the same
 * `LoginView` the login screen used, so every step of signing in (the code,
 * a new account's name, two-factor) happens here without leaving the page.
 *
 * The wrapper borrows the login screen's `auth-page` class for the spacing
 * and colour variables its card is written against, and switches off that
 * class's full-screen layout and patterned backdrop.
 */
export default function LoginDialog({
  returnTo,
  onClose,
  onAuthenticated,
}: {
  /** Where signing in with Google returns to: the page behind the pop-up. */
  returnTo: string;
  onClose: () => void;
  onAuthenticated: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={AUTH_CARD_HEADING_ID}
      data-login-dialog
      // Escape asks to close; the address, not the element, decides.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // The card fills the dialog, so a click on the dialog itself is a
      // click on the backdrop around it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-150 m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,460px)] max-w-none overflow-y-auto border-0 bg-transparent p-0 text-(--text) backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      <div className="auth-page min-h-0! bg-transparent! p-0! before:hidden!">
        <div className="auth-page__container">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 inline-flex size-8 items-center justify-center rounded-lg text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
          <div className="auth-page__form-column">
            <LoginView returnTo={returnTo} onAuthenticated={onAuthenticated} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
