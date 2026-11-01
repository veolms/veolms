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
  validateBackupCode,
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
  onBack?: () => void;
  /** Ends the half-signed-in session when the visitor cannot pass this step. */
  onSignOut?: () => void;
  allowPasskey?: boolean;
  allowAuthenticator?: boolean;
}

type TwoFactorMethod = TwoFactorFormProps["method"];

const CODE_LABEL = "Authentication code";
const BACKUP_CODE_LABEL = "Backup recovery code";
const MESSAGE_ID = "auth-two-factor-message";
const PASSKEY_ACTION = "Continue with passkey";
const USE_AUTHENTICATOR_ACTION = "Use authenticator app instead";
const USE_BACKUP_CODE_ACTION = "Use a backup code instead";
const USE_PASSKEY_ACTION = "Use passkey instead";
const NO_PASSKEY_HERE_ACTION = "Passkey not on this device? Use a backup code";
const SIGN_OUT_ACTION = "Sign out";

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
  onBack,
  onSignOut,
  status,
}: TwoFactorFormProps) {
  const verifying = status === "verifying";
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const error = invalidReason ?? errorMessage ?? null;
  const hasBothMethods = allowPasskey && allowAuthenticator;

  const chooseMethod = (next: TwoFactorMethod) => {
    setInvalidReason(null);
    setUseBackupCode(false);
    onMethodChange(next);
  };

  const changeCode = (next: string) => {
    setInvalidReason(null);
    onCodeChange(next);

    if (
      !useBackupCode &&
      next.length === 6 &&
      !validateOtpCode(next) &&
      !verifying
    ) {
      onSubmit(next);
    } else if (
      useBackupCode &&
      next.length === 8 &&
      !validateBackupCode(next) &&
      !verifying
    ) {
      onSubmit(next);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = useBackupCode
      ? validateBackupCode(code)
      : validateOtpCode(code);
    setInvalidReason(reason);

    if (reason) {
      return;
    }

    const clean = useBackupCode ? code.trim().replace(/\s+/g, "") : code;
    onSubmit(clean);
  };

  // A backup code stands in for whichever factor is out of reach, so an
  // account with only a passkey reaches the code form too. Without this, a
  // passkey kept on another device left no way past this step.
  const showCodeForm = method === "authenticator" || useBackupCode;

  const switchToBackupCode = () => {
    setInvalidReason(null);
    onCodeChange("");
    setUseBackupCode(true);
    if (allowAuthenticator) {
      onMethodChange("authenticator");
    }
  };

  const subheadingText = hasBothMethods
    ? "Choose a method to verify your identity"
    : useBackupCode
      ? "Enter one of your 8-digit backup codes"
      : method === "passkey"
        ? "Verify your identity with your passkey"
        : "Enter the code from your authenticator app";

  return (
    <div className="auth-two-factor">
      {onBack ? (
        <button
          className="auth-two-factor__back"
          disabled={verifying}
          onClick={onBack}
          type="button"
        >
          <Icon aria-hidden name="arrowLeft" size={17} />
          Back
        </button>
      ) : null}
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

        {!showCodeForm ? (
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
                      Your passkey is kept on the device or password manager
                      where you created it, so there is no code to type.
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

            <button
              className="auth-two-factor__alternate"
              disabled={verifying}
              onClick={switchToBackupCode}
              type="button"
            >
              {NO_PASSKEY_HERE_ACTION}
            </button>
          </div>
        ) : (
          <form className="auth-form" noValidate onSubmit={submit}>
            <div className="auth-form__field">
              <p className="auth-form__section-label">
                {useBackupCode ? BACKUP_CODE_LABEL : CODE_LABEL}
              </p>

              {useBackupCode ? (
                <div className="auth-form__input-shell">
                  <Icon aria-hidden name="lock" size={18} />
                  <input
                    aria-describedby={error === null ? undefined : MESSAGE_ID}
                    aria-invalid={error !== null}
                    autoComplete="off"
                    autoFocus
                    className="auth-form__input"
                    disabled={verifying}
                    inputMode="numeric"
                    maxLength={8}
                    onChange={(event) => {
                      const digits = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 8);
                      changeCode(digits);
                    }}
                    placeholder="8-digit backup code"
                    type="text"
                    value={code}
                  />
                </div>
              ) : (
                <OtpCodeInput
                  describedBy={error === null ? undefined : MESSAGE_ID}
                  disabled={verifying}
                  invalid={error !== null}
                  label={CODE_LABEL}
                  autoFocus
                  onChange={changeCode}
                  value={code}
                />
              )}

              {useBackupCode ? (
                <>
                  <p className="auth-form__helper">
                    Enter one of the 8-digit backup codes you saved when you set
                    up two-factor sign-in. Each code can only be used once.
                  </p>
                  <p className="auth-form__helper">
                    Lost your codes as well? Ask your academy&apos;s support
                    team to reset two-factor sign-in for your account.
                  </p>
                </>
              ) : (
                <>
                  <p className="auth-form__helper">
                    Open your authenticator app and enter the 6-digit code.
                  </p>
                  <p className="auth-form__helper">
                    Works with Google Authenticator, Authy, or Microsoft
                    Authenticator.
                  </p>
                </>
              )}

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

            {allowAuthenticator ? (
              <button
                className="auth-two-factor__alternate"
                onClick={() => {
                  setInvalidReason(null);
                  onCodeChange("");
                  setUseBackupCode(!useBackupCode);
                }}
                type="button"
              >
                {useBackupCode
                  ? USE_AUTHENTICATOR_ACTION
                  : USE_BACKUP_CODE_ACTION}
              </button>
            ) : null}

            {allowPasskey ? (
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

        {/* A half-signed-in session must have a way out: without it, a
            visitor who cannot pass this step was held on this screen. */}
        {onSignOut ? (
          <button
            className="auth-two-factor__alternate"
            onClick={onSignOut}
            type="button"
          >
            {SIGN_OUT_ACTION}
          </button>
        ) : null}
      </div>
    </div>
  );
}
