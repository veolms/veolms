import { useEffect, useState } from "react";
import { ArchiveIcon as Archive } from "@phosphor-icons/react/Archive";
import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/CreditCard";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import {
  useCurrentUser,
  useDeactivateAccount,
  useSignOut,
} from "../services/auth";
import "../styles/features/workspace.css";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { LogoutConfirmModal } from "../shell/LogoutConfirmModal";
import { AutosyncSyncError, autosyncManager } from "../lib/autosync";
import type { ProfileRole } from "./profileTypes";
import { getRoleDisplayName } from "../shell/workspaceRole";

export interface AccountSettingsProps {
  role: ProfileRole;
  isAuthenticated: boolean;
  userRoles?: readonly string[] | null;
  onNavigatePage?: (page: string) => void;
}

// Signing out and deactivating from this tab wait for unsaved changes to reach
// the server. When they could not, the dialog stayed open with no word on why.
const getUnsyncedChangesMessage = (error: unknown) => {
  if (error instanceof AutosyncSyncError) {
    if (error.status === "offline") {
      return "You're offline. Reconnect, then try again.";
    }
    if (error.key.entity === "profile") {
      return "Your profile has changes that couldn't be saved. Fix or discard them in Profile, then try again.";
    }
  }
  return "Some of your changes haven't been saved yet. Go back and finish saving them, then try again.";
};

/** Typed to confirm a deactivation, which cannot be undone from the app. */
const DEACTIVATE_PHRASE = "DEACTIVATE";

export function AccountSettings({
  role,
  isAuthenticated,
  userRoles,
  onNavigatePage,
}: AccountSettingsProps) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [unsyncedChangesMessage, setUnsyncedChangesMessage] = useState<
    string | null
  >(null);
  const { isPending: isSigningOut, signOut } = useSignOut();
  const deactivateMutation = useDeactivateAccount();
  const { data: currentUser } = useCurrentUser();
  const [deactivatePhrase, setDeactivatePhrase] = useState("");
  const deactivatePhraseMatches =
    deactivatePhrase.trim().toUpperCase() === DEACTIVATE_PHRASE;
  // The notice goes by email, so it is only promised to an account that
  // has an address to send it to.
  const hasEmail = Boolean(currentUser?.email);

  useEffect(() => {
    if (isAuthenticated) return;
    setLogoutConfirmOpen(false);
    setDeactivateConfirmOpen(false);
  }, [isAuthenticated]);

  const deactivateAccount = async () => {
    if (!deactivatePhraseMatches) return;
    setUnsyncedChangesMessage(null);
    try {
      await autosyncManager.requireSynced();
    } catch (error) {
      setUnsyncedChangesMessage(getUnsyncedChangesMessage(error));
      return;
    }
    try {
      await deactivateMutation.mutateAsync();
      setDeactivateConfirmOpen(false);
      window.location.href = "/";
    } catch {
      // The dialog remains open and exposes the API error so the user can retry.
    }
  };

  const signOutAfterSync = async () => {
    setUnsyncedChangesMessage(null);
    try {
      await autosyncManager.requireSynced();
      await signOut();
    } catch (error) {
      // Keep the dialog open when a draft is offline, blocked, or failed.
      setUnsyncedChangesMessage(getUnsyncedChangesMessage(error));
    }
  };

  const unsyncedChangesAlert = unsyncedChangesMessage ? (
    <span
      className="mt-3 block rounded-lg bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface-strong))] px-3 py-2 text-xs font-semibold text-(--danger)"
      role="alert"
    >
      {unsyncedChangesMessage}
    </span>
  ) : null;

  return (
    <div className="settings-detail" aria-label="Account settings">
      <header className="settings-detail__header">
        <div>
          <h2>Account</h2>
          <p>Review your plan, personal data, and account access.</p>
        </div>
      </header>

      <section
        className="settings-section"
        aria-labelledby="membership-heading"
      >
        <header className="settings-section__heading">
          <CreditCard size={20} weight="duotone" />
          <div>
            <h3 id="membership-heading">Membership</h3>
            <p>
              Your {role === "creator" ? "academy" : "learner"} account is ready
              to use.
            </p>
          </div>
        </header>
        <div className="settings-account-plan">
          <div>
            <span>Current access</span>
            <strong>
              {role === "creator"
                ? `${getRoleDisplayName("creator", userRoles)} workspace`
                : "Learning workspace"}
            </strong>
            <small>
              Manage purchases and receipts from your order history.
            </small>
          </div>
          <button
            type="button"
            className="settings-action"
            disabled={!isAuthenticated}
            onClick={() =>
              onNavigatePage?.(
                role === "creator" ? "orders" : "purchase-history",
              )
            }
          >
            <CreditCard size={16} /> View orders
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="data-heading">
        <header className="settings-section__heading">
          <Archive size={20} weight="duotone" />
          <div>
            <h3 id="data-heading">Your data</h3>
            <p>
              Keep a portable copy of the information connected to this account.
            </p>
          </div>
        </header>
        <div className="settings-account-plan">
          <div>
            <strong>Export your data</strong>
            <small id="account-export-availability">
              Data export isn&apos;t available yet.
            </small>
          </div>
          <button
            type="button"
            className="settings-action"
            aria-describedby="account-export-availability"
            disabled
          >
            <DownloadSimple size={16} /> Export unavailable
          </button>
        </div>
      </section>

      {isAuthenticated && (
        <section
          className="settings-section settings-section--danger"
          aria-labelledby="deactivate-heading"
        >
          <header className="settings-section__heading">
            <Trash size={20} weight="duotone" />
            <div>
              <h3 id="deactivate-heading">Deactivate account</h3>
              <p>Remove access to this account and sign out everywhere.</p>
            </div>
          </header>
          <div className="settings-account-plan">
            <div>
              <strong>Deactivate your account</strong>
              <small>
                This takes effect straight away: you are signed out of every
                device and cannot sign in again.
                {hasEmail ? " We email you a notice once it is done." : ""}
              </small>
            </div>
            <button
              type="button"
              className="settings-action settings-action--danger"
              onClick={() => {
                deactivateMutation.reset();
                setUnsyncedChangesMessage(null);
                setDeactivatePhrase("");
                setDeactivateConfirmOpen(true);
              }}
              disabled={deactivateMutation.isPending}
            >
              <Trash size={16} /> Deactivate account
            </button>
          </div>
        </section>
      )}

      {isAuthenticated && (
        <section className="settings-section" aria-labelledby="signout-heading">
          <header className="settings-section__heading">
            <SignOut size={20} weight="duotone" />
            <div>
              <h3 id="signout-heading">Session</h3>
              <p>Sign out of your active session on this device.</p>
            </div>
          </header>
          <div className="settings-account-plan">
            <div>
              <strong>Log out</strong>
              <small>
                You will need to sign in again with your email or mobile OTP.
              </small>
            </div>
            <button
              type="button"
              className="settings-action"
              onClick={() => {
                setUnsyncedChangesMessage(null);
                setLogoutConfirmOpen(true);
              }}
            >
              <SignOut size={16} /> Sign out
            </button>
          </div>
        </section>
      )}

      <LogoutConfirmModal
        isOpen={isAuthenticated && logoutConfirmOpen}
        isPending={isSigningOut}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => void signOutAfterSync()}
        notice={unsyncedChangesAlert}
      />

      <ConfirmActionModal
        id="deactivate-account-modal"
        isOpen={isAuthenticated && deactivateConfirmOpen}
        isPending={deactivateMutation.isPending}
        confirmDisabled={!deactivatePhraseMatches}
        onClose={() => setDeactivateConfirmOpen(false)}
        onConfirm={() => void deactivateAccount()}
        icon={Trash}
        title="Deactivate account?"
        description={
          <>
            <span>
              This signs you out everywhere and permanently disables access to
              this account. It happens as soon as you confirm, and you cannot
              undo it yourself. Your stored account record will be retained as
              required for platform records.
            </span>
            {/* A permanent action used to take one click on a button. The
                word has to be typed, so it cannot be confirmed by a stray
                click or a held Enter. */}
            <label className="mt-4 block text-xs font-semibold text-(--text)">
              Type {DEACTIVATE_PHRASE} to confirm
              <input
                type="text"
                value={deactivatePhrase}
                onChange={(event) => setDeactivatePhrase(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && deactivatePhraseMatches) {
                    void deactivateAccount();
                  }
                }}
                disabled={deactivateMutation.isPending}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={DEACTIVATE_PHRASE}
                className="mt-1.5 block h-10 w-full rounded-lg bg-(--surface-strong) px-3 text-sm! font-semibold! tracking-wide text-(--text) ring-1 ring-[color-mix(in_srgb,var(--text)_14%,transparent)] outline-none ring-inset placeholder:font-normal placeholder:text-(--muted) focus:ring-2 focus:ring-(--danger)"
              />
            </label>
            {unsyncedChangesAlert}
            {deactivateMutation.error && (
              <span
                className="mt-3 block rounded-lg bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface-strong))] px-3 py-2 text-xs font-semibold text-(--danger)"
                role="alert"
              >
                {deactivateMutation.error.message}
              </span>
            )}
          </>
        }
        cancelLabel="Keep my account"
        confirmLabel="Deactivate account"
        pendingLabel="Deactivating…"
        tone="danger"
      />
    </div>
  );
}
