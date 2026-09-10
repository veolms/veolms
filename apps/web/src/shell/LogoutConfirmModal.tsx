import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { ConfirmActionModal } from "./ConfirmActionModal";

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmModal({
  isOpen,
  isPending = false,
  onClose,
  onConfirm,
}: LogoutConfirmModalProps) {
  return (
    <ConfirmActionModal
      id="logout-modal"
      isOpen={isOpen}
      isPending={isPending}
      onClose={onClose}
      onConfirm={onConfirm}
      icon={SignOut}
      title="Sign out?"
      description="This ends your session on this device. You can sign back in anytime to return to your courses and workspace."
      cancelLabel="Stay signed in"
      confirmLabel="Sign out"
      pendingLabel="Signing out…"
    />
  );
}
