import { useState } from "react";
import type { FormEvent } from "react";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/registry.ts";
import { AuthBrandMark } from "./AuthBrandPanel.tsx";
import { OtpCodeInput } from "./OtpCodeInput.tsx";
import {
  AUTH_CARD_HEADING_ID,
  OTP_ACTION_LABELS,
  validateOtpCode,
} from "./authFlow.ts";

export interface TwoFactorFormProps {
  method: "passkey" | "authenticator";
  onMethodChange: (method: "passkey" | "authenticator") => void;
  code: string;
  onCodeChange: (code: string) => void;
  status: "idle" | "verifying";
  errorMessage?: string;
  onSubmit: (code: string) => void;
  onUsePasskey: () => void;
  allowPasskey?: boolean;
  allowAuthenticator?: boolean;
}

type TwoFactorMethod = TwoFactorFormProps["method"];

const CODE_LABEL = "Authentication code";
const MESSAGE_ID = "auth-two-factor-message";
const PASSKEY_ACTION = "Continue with passkey";
const USE_AUTHENTICATOR_ACTION = "Use authenticator app instead";
const USE_PASSKEY_ACTION = "Use passkey instead";

const METHOD_TABS: readonly (readonly [TwoFactorMethod, string, IconName])[] = [
  ["passkey", "Passkey", "passkey"],
  ["authenticator", "Authenticator app", "authenticator"],
];

export function TwoFactorForm({
  allowAuthenticator = true,
  allowPasskey = true,
  code,
  errorMessage,
  method,
  onCodeChange,
  onMethodChange,
  onSubmit,
  onUsePasskey,
  status,
}: TwoFactorFormProps) {
  const verifying = status === "verifying";
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const error = invalidReason ?? errorMessage ?? null;
  const hasBothMethods = allowPasskey && allowAuthenticator;

  const chooseMethod = (next: TwoFactorMethod) => {
    setInvalidReason(null);
    onMethodChange(next);
  };

  const changeCode = (next: string) => {
    setInvalidReason(null);
    onCodeChange(next);

    if (next.length === 6 && !validateOtpCode(next) && !verifying) {
      onSubmit(next);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = validateOtpCode(code);
    setInvalidReason(reason);

    if (reason) {
      return;
    }

    onSubmit(code);
  };

  const subheadingText = hasBothMethods
    ? "Choose a method to verify your identity"
    : method === "passkey"
      ? "Verify your identity with your passkey"
      : "Enter the code from your authenticator app";

  return (
    <div className="auth-two-factor">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        Two-factor authentication
      </h1>
      <p className="auth-card__subheading">{subheadingText}</p>

      <div className="auth-card__form-slot">
        {hasBothMethods ? (
          <div
            aria-label="Verification method"
            className="auth-method-switch"
            role="tablist"
          >
            {METHOD_TABS.map(([value, label, glyph]) => (
              <button
                aria-selected={method === value}
                className="auth-method-switch__tab"
                key={value}
                onClick={() => chooseMethod(value)}
                onKeyDown={handleRovingTabKeyDown}
                role="tab"
                tabIndex={method === value ? 0 : -1}
                type="button"
              >
                <Icon
                  aria-hidden
                  emphasis={method === value ? "bold" : "regular"}
                  name={glyph}
                  size={16}
                />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {method === "passkey" ? (
          <div className="auth-two-factor__passkey">
            <div className="auth-two-factor__panel">
              <div className="auth-two-factor__panel-body">
                <p className="auth-two-factor__badge">
                  <Icon
                    aria-hidden
                    emphasis="fill"
                    name="recommended"
                    size={11}
                  />
                  Recommended
                </p>

                <div className="auth-two-factor__intro">
                  <span className="auth-two-factor__mark">
                    <Icon aria-hidden name="passkey" size={22} />
                  </span>

                  <div className="auth-two-factor__copy">
                    <p className="auth-two-factor__title">
                      Sign in with your passkey
                    </p>
                    <p className="auth-two-factor__body">
                      Your passkey is kept on this device or in your password
                      manager, so there is no code to type.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {error === null ? null : (
              <p className="auth-form__error" id={MESSAGE_ID} role="alert">
                {error}
              </p>
            )}

            <button
              aria-busy={verifying}
              className="auth-form__submit"
              disabled={verifying}
              onClick={onUsePasskey}
              type="button"
            >
              <span className="auth-form__submit-label">
                {verifying ? OTP_ACTION_LABELS.verifying : PASSKEY_ACTION}
              </span>
              <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
            </button>

            {hasBothMethods ? (
              <button
                className="auth-two-factor__alternate"
                onClick={() => chooseMethod("authenticator")}
                type="button"
              >
                {USE_AUTHENTICATOR_ACTION}
              </button>
            ) : null}
          </div>
        ) : (
          <form className="auth-form" noValidate onSubmit={submit}>
            <div className="auth-form__field">
              <p className="auth-form__section-label">{CODE_LABEL}</p>

              <OtpCodeInput
                describedBy={error === null ? undefined : MESSAGE_ID}
                disabled={verifying}
                invalid={error !== null}
                label={CODE_LABEL}
                onChange={changeCode}
                value={code}
              />

              <p className="auth-form__helper">
                Open your authenticator app and enter the 6-digit code.
              </p>
              <p className="auth-form__helper">
                Works with Google Authenticator, Authy, or Microsoft
                Authenticator.
              </p>

              {error === null ? null : (
                <p className="auth-form__error" id={MESSAGE_ID} role="alert">
                  {error}
                </p>
              )}
            </div>

            <button
              aria-busy={verifying}
              className="auth-form__submit"
              disabled={verifying}
              type="submit"
            >
              <span className="auth-form__submit-label">
                {verifying
                  ? OTP_ACTION_LABELS.verifying
                  : OTP_ACTION_LABELS.verify}
              </span>
              <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
            </button>

            {hasBothMethods ? (
              <button
                className="auth-two-factor__alternate"
                onClick={() => chooseMethod("passkey")}
                type="button"
              >
                {USE_PASSKEY_ACTION}
              </button>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
