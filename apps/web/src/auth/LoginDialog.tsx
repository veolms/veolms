import { AuthCardDialog } from "./AuthCardDialog";
import { AUTH_CARD_HEADING_ID } from "./authFlow";
import { LoginView } from "./LoginView";
import { removeLoginDialogSnapshot } from "./loginDialogSnapshot";

/**
 * The login card as a pop-up over whatever page asked for it. It is the same
 * `LoginView` the login screen used, so every step of signing in (the code,
 * a new account's name, two-factor) happens here without leaving the page.
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
  return (
    <AuthCardDialog
      labelledBy={AUTH_CARD_HEADING_ID}
      data-login-dialog
      onClose={onClose}
      // In the same frame: the copy that stood in for the pop-up while the
      // page loaded (after a full-tab sign-in) goes as the pop-up opens.
      onOpened={removeLoginDialogSnapshot}
    >
      <LoginView returnTo={returnTo} onAuthenticated={onAuthenticated} />
    </AuthCardDialog>
  );
}
