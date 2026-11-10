import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArchiveIcon as Archive } from "@phosphor-icons/react/Archive";
import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/CreditCard";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { useSignOut } from "../services/auth";
import "../styles/features/workspace.css";
import { LogoutConfirmModal } from "../shell/LogoutConfirmModal";
import { AutosyncSyncError, autosyncManager } from "../lib/autosync";
import type { ProfileRole } from "./profileTypes";
import { getRoleDisplayName } from "../shell/workspaceRole";
import { useAdminOnlySettings } from "./useAdminOnlySettings";

export interface AccountSettingsProps {
  role: ProfileRole;
  isAuthenticated: boolean;
  userRoles?: readonly string[] | null;
  onNavigatePage?: (page: string) => void;
}

// Signing out from this tab waits for unsaved changes to reach
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

export function AccountSettings({
  role,
  isAuthenticated,
  userRoles,
  onNavigatePage,
}: AccountSettingsProps) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [unsyncedChangesMessage, setUnsyncedChangesMessage] = useState<
    string | null
  >(null);
  const { isPending: isSigningOut, signOut } = useSignOut();
  // Data export is not built yet: its section, a disabled button, is shown
  // to admins alone (see `useAdminOnlySettings`).
  const showAdminSettings = useAdminOnlySettings();

  useEffect(() => {
    if (isAuthenticated) return;
    setLogoutConfirmOpen(false);
  }, [isAuthenticated]);

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

      {showAdminSettings ? (
        <section className="settings-section" aria-labelledby="data-heading">
          <header className="settings-section__heading">
            <Archive size={20} weight="duotone" />
            <div>
              <h3 id="data-heading">Your data</h3>
              <p>
                Keep a portable copy of the information connected to this
                account.
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
      ) : null}

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

      {isAuthenticated && (
        <section
          className="settings-section settings-section--danger"
          aria-labelledby="delete-heading"
        >
          <header className="settings-section__heading">
            <Trash size={20} weight="duotone" />
            <div>
              <h3 id="delete-heading">Delete account</h3>
              <p>Remove this account and the data linked to it.</p>
            </div>
          </header>
          {/* Deletion is requested by email; the page explains how. */}
          <div className="settings-account-plan">
            <div>
              <strong>Delete your account</strong>
              <small>Permanently delete your account and data.</small>
            </div>
            <Link
              to="/delete-account"
              className="settings-action settings-action--delete"
            >
              <Trash size={16} /> Delete account
            </Link>
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
    </div>
  );
}
