import type { ReactNode } from "react";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { ConfirmActionModal } from "./ConfirmActionModal";

const LOGOUT_DESCRIPTION =
  "You'll need to sign in again to get back to your courses.";

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Shown under the description, e.g. why signing out is on hold. */
  notice?: ReactNode;
}

export function LogoutConfirmModal({
  isOpen,
  isPending = false,
  onClose,
  onConfirm,
  notice,
}: LogoutConfirmModalProps) {
  return (
    <ConfirmActionModal
      id="logout-modal"
      isOpen={isOpen}
      isPending={isPending}
      onClose={onClose}
      onConfirm={onConfirm}
      icon={SignOut}
      iconWeight="regular"
      appearance="loginCard"
      closeOnConfirm
      title="Sign out?"
      description={
        notice ? (
          <>
            <span>{LOGOUT_DESCRIPTION}</span>
            {notice}
          </>
        ) : (
          LOGOUT_DESCRIPTION
        )
      }
      cancelLabel="Cancel"
      confirmLabel="Sign out"
      pendingLabel="Signing out…"
    />
  );
}
