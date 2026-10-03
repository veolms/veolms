import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import type { ReactNode } from "react";
import { Icon } from "../icons/Icon";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { AuthBrandMark } from "./AuthBrandPanel";
import { AUTH_CARD_HEADING_ID } from "./authFlow";

interface AuthProgressProps {
  title: string;
  detail: string;
}

export function AuthProgress({ title, detail }: AuthProgressProps) {
  return (
    <div className="auth-progress">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        {title}
      </h1>
      <p className="auth-card__subheading">{detail}</p>
      <div aria-live="polite" className="auth-progress__indicator" role="status">
        <LoadingSpinnerIcon size={22} />
        <div className="auth-progress__indicator-copy">
          <p className="auth-progress__indicator-title">Please wait</p>
          <p className="auth-progress__indicator-detail">This usually takes a few seconds.</p>
        </div>
      </div>
    </div>
  );
}

interface AuthBusySubmitProps {
  busy: boolean;
  busyLabel: string;
  disabled?: boolean;
  label: string;
  pendingMessage?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  icon?: ReactNode;
}

export function AuthBusySubmit({
  busy,
  busyLabel,
  disabled = false,
  label,
  pendingMessage,
  type = "submit",
  onClick,
  icon,
}: AuthBusySubmitProps) {
  return (
    <>
      {busy && pendingMessage ? (
        <p className="auth-form__pending" role="status">
          {pendingMessage}
        </p>
      ) : null}
      <button
        aria-busy={busy}
        className="auth-form__submit"
        disabled={busy || disabled}
        onClick={onClick}
        type={type}
      >
        <span className="auth-form__submit-label">{busy ? busyLabel : label}</span>
        {busy ? (
          <CircleNotchIcon aria-hidden className="auth-form__spinner" size={18} weight="bold" />
        ) : (
          (icon ?? <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />)
        )}
      </button>
    </>
  );
}
