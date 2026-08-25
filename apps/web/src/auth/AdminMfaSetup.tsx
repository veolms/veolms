import { useState } from "react";
import type { FormEvent } from "react";
import { AuthBrandMark } from "./AuthBrandPanel.tsx";
import { MFA_CONFIG } from "./mfa.config.ts";
import { OtpCodeInput } from "./OtpCodeInput.tsx";
import { Icon } from "../icons/Icon.tsx";
import { AUTH_CARD_HEADING_ID, validateOtpCode } from "./authFlow.ts";
import { isPasskeySupported, startPasskeyRegistration } from "./webauthn.ts";
import {
  useSetupTotp,
  useEnableTotp,
  usePasskeyRegisterOptions,
  usePasskeyRegisterVerify,
} from "../services/auth";

export type AdminMfaMethod = "passkey" | "authenticator";

export interface AdminMfaSetupProps {
  onDone: () => void;
  onError: (message: string) => void;
}

const STEP_LABELS = {
  chooseMethod: "Secure your account",
  scanQr: "Scan with your authenticator app",
  enterCode: "Verify your authenticator",
  backupCodes: "Save your backup codes",
  passkeyPending: "Continue with passkey",
} as const;

interface BackupCodesScreenProps {
  codes: string[];
  onContinue: () => void;
}

function BackupCodesScreen({ codes, onContinue }: BackupCodesScreenProps) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard write error */
    }
  };

  return (
    <div className="auth-mfa-setup">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        Save your backup codes
      </h1>
      <p className="auth-card__subheading">
        Store these codes somewhere safe. Each code can be used once if you ever
        lose access to your authenticator app.
      </p>

      <div className="auth-card__form-slot">
        <ul className="auth-mfa-setup__backup-codes" aria-label="Backup codes">
          {codes.map((code) => (
            <li key={code} className="auth-mfa-setup__backup-code">
              <code>{code}</code>
            </li>
          ))}
        </ul>

        <button
          className="auth-mfa-setup__copy-button"
          onClick={copyAll}
          type="button"
        >
          <Icon aria-hidden name="copy" size={16} />
          {copied ? "Copied!" : "Copy all codes"}
        </button>

        <button
          className="auth-form__submit"
          onClick={onContinue}
          type="button"
        >
          <span className="auth-form__submit-label">
            I&apos;ve saved my codes — Continue
          </span>
          <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
        </button>
      </div>
    </div>
  );
}

type Screen =
  "chooseMethod" | "totpQr" | "totpVerify" | "backupCodes" | "passkeyPending";

export function AdminMfaSetup({ onDone, onError }: AdminMfaSetupProps) {
  const [screen, setScreen] = useState<Screen>("chooseMethod");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [codeError, setCodeError] = useState<string | null>(null);

  const setupTotpMutation = useSetupTotp();
  const enableTotpMutation = useEnableTotp();
  const passkeyOptionsMutation = usePasskeyRegisterOptions();
  const passkeyVerifyMutation = usePasskeyRegisterVerify();

  const passkeySupported = isPasskeySupported();

  const handleSetupPasskey = async () => {
    setScreen("passkeyPending");
    try {
      const serverOptions = await passkeyOptionsMutation.mutateAsync();
      const credential = await startPasskeyRegistration(serverOptions);
      await passkeyVerifyMutation.mutateAsync(credential);
      onDone();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      const message =
        errorObj?.message ||
        "Passkey registration failed. Please try again or use an authenticator app.";
      onError(message);
      setScreen("chooseMethod");
    }
  };

  const handleSetupTotp = async () => {
    try {
      const data = await setupTotpMutation.mutateAsync();
      setTotpSecret(data.secret);
      setTotpUri(data.uri);
      setScreen("totpQr");
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      onError(
        errorObj?.message ||
          "Could not start authenticator setup. Please try again.",
      );
    }
  };

  const submitTotpCode = async (codeToVerify: string) => {
    const validationError = validateOtpCode(codeToVerify);
    if (validationError) {
      setCodeError(validationError);
      return;
    }

    setCodeError(null);
    try {
      const result = await enableTotpMutation.mutateAsync({
        code: codeToVerify,
        secret: totpSecret,
      });
      setBackupCodes(result.backupCodes);
      setScreen("backupCodes");
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setCodeError(
        errorObj?.message ||
          "Invalid code. Check your authenticator app and try again.",
      );
    }
  };

  const handleVerifyTotp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enableTotpMutation.isPending) {
      void submitTotpCode(totpCode);
    }
  };

  if (screen === "backupCodes") {
    return <BackupCodesScreen codes={backupCodes} onContinue={onDone} />;
  }

  if (screen === "passkeyPending") {
    return (
      <div className="auth-mfa-setup">
        <AuthBrandMark />
        <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
          {STEP_LABELS.passkeyPending}
        </h1>
        <p className="auth-card__subheading">
          Follow the prompt from your browser or device to register your
          passkey.
        </p>
        <div className="auth-card__form-slot">
          <div className="auth-mfa-setup__pending">
            <span className="auth-two-factor__mark">
              <Icon aria-hidden name="passkey" size={24} />
            </span>
            <p className="auth-two-factor__body">
              Waiting for passkey confirmation…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "totpQr") {
    return (
      <div className="auth-mfa-setup">
        <AuthBrandMark />
        <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
          {STEP_LABELS.scanQr}
        </h1>
        <p className="auth-card__subheading">
          Open Google Authenticator, Authy, or any TOTP app and scan the QR
          code, or enter the key manually.
        </p>

        <div className="auth-card__form-slot">
          <div className="auth-mfa-setup__qr-wrapper" aria-hidden="true">
            <img
              alt="QR code for authenticator app"
              className="auth-mfa-setup__qr"
              src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(totpUri)}&size=180x180&margin=2`}
              width={180}
              height={180}
            />
          </div>

          <div className="auth-mfa-setup__secret">
            <p className="auth-form__helper">Or enter this key manually:</p>
            <code className="auth-mfa-setup__secret-key">{totpSecret}</code>
          </div>

          <button
            className="auth-form__submit"
            disabled={setupTotpMutation.isPending}
            onClick={() => setScreen("totpVerify")}
            type="button"
          >
            <span className="auth-form__submit-label">
              I&apos;ve scanned the code
            </span>
            <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
          </button>

          <button
            className="auth-two-factor__alternate"
            onClick={() => setScreen("chooseMethod")}
            type="button"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  if (screen === "totpVerify") {
    return (
      <div className="auth-mfa-setup">
        <AuthBrandMark />
        <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
          {STEP_LABELS.enterCode}
        </h1>
        <p className="auth-card__subheading">
          Enter the 6-digit code shown in your authenticator app to confirm it
          is working.
        </p>

        <div className="auth-card__form-slot">
          <form className="auth-form" noValidate onSubmit={handleVerifyTotp}>
            <div className="auth-form__field">
              <OtpCodeInput
                describedBy={codeError ? "admin-mfa-code-error" : undefined}
                disabled={enableTotpMutation.isPending}
                invalid={codeError !== null}
                label="Authentication code"
                onChange={(code) => {
                  setTotpCode(code);
                  setCodeError(null);
                  if (
                    code.length === 6 &&
                    !validateOtpCode(code) &&
                    !enableTotpMutation.isPending
                  ) {
                    void submitTotpCode(code);
                  }
                }}
                value={totpCode}
              />

              {codeError ? (
                <p
                  className="auth-form__error"
                  id="admin-mfa-code-error"
                  role="alert"
                >
                  {codeError}
                </p>
              ) : null}
            </div>

            <button
              aria-busy={enableTotpMutation.isPending}
              className="auth-form__submit"
              disabled={enableTotpMutation.isPending}
              type="submit"
            >
              <span className="auth-form__submit-label">
                {enableTotpMutation.isPending
                  ? "Verifying…"
                  : "Verify & activate"}
              </span>
              <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
            </button>

            <button
              className="auth-two-factor__alternate"
              onClick={() => setScreen("totpQr")}
              type="button"
            >
              ← Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-mfa-setup">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        {STEP_LABELS.chooseMethod}
      </h1>
      <p className="auth-card__subheading">
        Set up a passkey or authenticator app before you continue to your
        account.
      </p>

      <div className="auth-card__form-slot">
        {MFA_CONFIG.ALLOW_PASSKEY && passkeySupported && (
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
                  <p className="auth-two-factor__title">Register a passkey</p>
                  <p className="auth-two-factor__body">
                    Use your device fingerprint, face, or PIN. No code to type —
                    secure and phishing-resistant.
                  </p>
                </div>
              </div>
            </div>

            <button
              aria-busy={passkeyOptionsMutation.isPending}
              className="auth-form__submit"
              disabled={
                passkeyOptionsMutation.isPending ||
                passkeyVerifyMutation.isPending
              }
              onClick={handleSetupPasskey}
              type="button"
              style={{ margin: "0 14px 14px" }}
            >
              <span className="auth-form__submit-label">
                {passkeyOptionsMutation.isPending
                  ? "Preparing…"
                  : "Set up passkey"}
              </span>
              <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
            </button>
          </div>
        )}

        {MFA_CONFIG.ALLOW_TOTP && (
          <button
            aria-busy={setupTotpMutation.isPending}
            className="auth-form__submit"
            disabled={setupTotpMutation.isPending}
            onClick={handleSetupTotp}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--auth-line)",
              boxShadow: "none",
            }}
            type="button"
          >
            <span className="auth-form__submit-label">
              <Icon aria-hidden name="authenticator" size={18} />
              {setupTotpMutation.isPending
                ? "Loading…"
                : "Use authenticator app"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
