import { createPortal } from "react-dom";
import type { ReactNode } from "react";
// Settings can be opened directly, so their modal styles belong to this shared overlay.
import "../auth/mfa-setup.css";

export function SettingsModalOverlay({
  labelledBy,
  children,
}: {
  labelledBy: string;
  children: ReactNode;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="auth-mfa-setup__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {children}
    </div>,
    document.body,
  );
}
