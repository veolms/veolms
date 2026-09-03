import { useEffect, useState } from "react";
import { ArchiveIcon as Archive } from "@phosphor-icons/react/Archive";
import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/CreditCard";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { useDeactivateAccount, useSignOut } from "../services/auth";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import { LogoutConfirmModal } from "../shell/LogoutConfirmModal";
import type { ProfileRole } from "./profilePreferences";

export interface AccountSettingsProps {
  role: ProfileRole;
  isAuthenticated: boolean;
  onNavigatePage?: (page: string) => void;
}

export function AccountSettings({
  role,
  isAuthenticated,
  onNavigatePage,
}: AccountSettingsProps) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const { isPending: isSigningOut, signOut } = useSignOut();
  const deactivateMutation = useDeactivateAccount();

  useEffect(() => {
    if (isAuthenticated) return;
    setLogoutConfirmOpen(false);
    setDeactivateConfirmOpen(false);
  }, [isAuthenticated]);

  const deactivateAccount = async () => {
    try {
      await deactivateMutation.mutateAsync();
      setDeactivateConfirmOpen(false);
      window.location.href = "/";
    } catch {
      // The dialog remains open and exposes the API error so the user can retry.
    }
  };

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
              {role === "creator" ? "Creator workspace" : "Learning workspace"}
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
              onNavigatePage?.(role === "creator" ? "orders" : "order-history")
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
              Export is not connected yet. No request will be sent until the
              server export service is available.
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
                You will be signed out of every device and will not be able to
                sign in again. We will send a confirmation email.
              </small>
            </div>
            <button
              type="button"
              className="settings-action settings-action--danger"
              onClick={() => {
                deactivateMutation.reset();
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
              onClick={() => setLogoutConfirmOpen(true)}
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
        onConfirm={signOut}
      />

      <ConfirmActionModal
        id="deactivate-account-modal"
        isOpen={isAuthenticated && deactivateConfirmOpen}
        isPending={deactivateMutation.isPending}
        onClose={() => setDeactivateConfirmOpen(false)}
        onConfirm={() => void deactivateAccount()}
        icon={Trash}
        title="Deactivate account?"
        description={
          <>
            <span>
              This signs you out everywhere and permanently disables access to
              this account. Your stored account record will be retained as
              required for platform records.
            </span>
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
