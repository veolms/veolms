import {
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { FingerprintIcon as Fingerprint } from "@phosphor-icons/react/Fingerprint";
import { LaptopIcon as Laptop } from "@phosphor-icons/react/Laptop";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { TimerIcon as Timer } from "@phosphor-icons/react/Timer";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { XIcon as X } from "@phosphor-icons/react/X";
import { SettingRow } from "./SettingsControls";
import {
  formatRelativeDate,
  formatSessionDevice,
  isMobileSession,
} from "./sessionDisplay";
import { MFA_CONFIG } from "../auth/mfa.config";
import { OtpCodeInput } from "../auth/OtpCodeInput";
import { validateOtpCode } from "../auth/authFlow";
import { isPasskeySupported, startPasskeyRegistration } from "../auth/webauthn";
import {
  useCurrentUser,
  useSetupTotp,
  useEnableTotp,
  usePasskeyRegisterOptions,
  usePasskeyRegisterVerify,
  useSessions,
  useRevokeSession,
  useRevokeAllOtherSessions,
} from "../services/auth";

const subscribeToPasskeySupport = () => () => undefined;
const getPasskeyServerSupport = () => false;

function SettingsModalOverlay({
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

interface BackupCodesModalProps {
  codes: string[];
  onClose: () => void;
}

function BackupCodesModal({ codes, onClose }: BackupCodesModalProps) {
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
    <SettingsModalOverlay labelledBy="backup-codes-title">
      <div className="auth-mfa-setup__modal">
        <div className="auth-mfa-setup__modal-header">
          <h3 id="backup-codes-title">Save your backup codes</h3>
          <button
            aria-label="Close"
            className="auth-mfa-setup__modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <p className="auth-mfa-setup__modal-body">
          Store these codes somewhere safe. Each can be used once if you lose
          access to your authenticator app.
        </p>

        <ul className="auth-mfa-setup__backup-codes" aria-label="Backup codes">
          {codes.map((code) => (
            <li key={code} className="auth-mfa-setup__backup-code">
              <code>{code}</code>
            </li>
          ))}
        </ul>

        <div
          className="auth-mfa-setup__modal-actions"
          style={{ justifyContent: "space-between" }}
        >
          <button
            className="auth-mfa-setup__copy-button"
            onClick={copyAll}
            type="button"
          >
            {copied ? "Copied!" : "Copy all codes"}
          </button>
          <button className="settings-action" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </SettingsModalOverlay>
  );
}

interface TotpSetupModalProps {
  onSuccess: (backupCodes: string[]) => void;
  onClose: () => void;
}

function TotpSetupModal({ onSuccess, onClose }: TotpSetupModalProps) {
  const [step, setStep] = useState<"loading" | "qr" | "verify">("loading");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const setupMutation = useSetupTotp();
  const enableMutation = useEnableTotp();

  const startSetup = async () => {
    try {
      const data = await setupMutation.mutateAsync();
      setSecret(data.secret);
      setUri(data.uri);
      setStep("qr");
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setCodeError(errorObj?.message || "Could not start authenticator setup.");
    }
  };

  if (step === "loading" && !setupMutation.isPending) {
    void startSetup();
  }

  const submitCode = async (codeToVerify: string) => {
    const validationError = validateOtpCode(codeToVerify);
    if (validationError) {
      setCodeError(validationError);
      return;
    }
    setCodeError(null);
    try {
      const result = await enableMutation.mutateAsync({
        code: codeToVerify,
        secret,
      });
      onSuccess(result.backupCodes);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setCodeError(
        errorObj?.message ||
          "Invalid code. Check your authenticator app and try again.",
      );
    }
  };

  const handleVerify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enableMutation.isPending) {
      void submitCode(code);
    }
  };

  return (
    <SettingsModalOverlay labelledBy="totp-modal-title">
      <div className="auth-mfa-setup__modal">
        <div className="auth-mfa-setup__modal-header">
          <h3 id="totp-modal-title">
            {step === "verify"
              ? "Verify authenticator"
              : "Set up authenticator"}
          </h3>
          <button
            aria-label="Close"
            className="auth-mfa-setup__modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {step === "loading" && (
          <p className="auth-mfa-setup__loading">Preparing setup…</p>
        )}

        {step === "qr" && (
          <>
            <p className="auth-mfa-setup__modal-body">
              Scan this QR code with Google Authenticator, Authy, or any TOTP
              app.
            </p>

            <div className="auth-mfa-setup__qr-wrapper" aria-hidden="true">
              <img
                alt="Authenticator QR Code"
                className="auth-mfa-setup__qr"
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(uri)}&size=160x160&margin=2`}
                width={160}
                height={160}
              />
            </div>

            <div className="auth-mfa-setup__secret">
              <span className="auth-mfa-setup__inline-hint">
                Or enter key manually:
              </span>
              <code className="auth-mfa-setup__secret-key">{secret}</code>
            </div>

            <div
              className="auth-mfa-setup__modal-actions"
              style={{ justifyContent: "flex-end", marginTop: "8px" }}
            >
              <button
                className="settings-action settings-action--quiet"
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="settings-action"
                onClick={() => setStep("verify")}
                type="button"
              >
                Next: Enter code →
              </button>
            </div>
          </>
        )}

        {step === "verify" && (
          <form
            className="auth-mfa-setup__verify-form"
            noValidate
            onSubmit={handleVerify}
          >
            <p className="auth-mfa-setup__modal-body">
              Enter the 6-digit code shown in your authenticator app to confirm
              it is working.
            </p>

            <OtpCodeInput
              describedBy={codeError ? "totp-setup-error" : undefined}
              disabled={enableMutation.isPending}
              invalid={codeError !== null}
              label="Authentication code"
              onChange={(v) => {
                setCode(v);
                setCodeError(null);
                if (
                  v.length === 6 &&
                  !validateOtpCode(v) &&
                  !enableMutation.isPending
                ) {
                  void submitCode(v);
                }
              }}
              value={code}
            />

            {codeError ? (
              <p
                className="auth-form__error"
                id="totp-setup-error"
                role="alert"
                style={{ textAlign: "center" }}
              >
                {codeError}
              </p>
            ) : null}

            <div
              className="auth-mfa-setup__modal-actions"
              style={{ justifyContent: "space-between", marginTop: "8px" }}
            >
              <button
                className="settings-action settings-action--quiet"
                onClick={() => setStep("qr")}
                type="button"
              >
                ← Back
              </button>
              <button
                aria-busy={enableMutation.isPending}
                className="settings-action"
                disabled={enableMutation.isPending}
                type="submit"
              >
                {enableMutation.isPending ? "Verifying…" : "Verify & Activate"}
              </button>
            </div>
          </form>
        )}
      </div>
    </SettingsModalOverlay>
  );
}

const SECURITY_ROW_CLASS =
  "max-[480px]:[grid-template-columns:2rem_minmax(0,1fr)] max-[480px]:[&_.settings-row__control]:col-start-2 max-[480px]:[&_.settings-row__control]:justify-stretch max-[480px]:[&_.settings-action]:w-full";

function RecommendedBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-(--accent-soft) px-1.5 py-px text-[0.62rem] font-semibold text-(--accent)">
      <Star aria-hidden size={10} weight="fill" />
      Recommended
    </span>
  );
}

function StatusNote({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 text-[0.72rem] font-semibold whitespace-nowrap text-(--muted)">
      {children}
    </span>
  );
}

export function SecuritySettings() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const sessionQuery = useSessions({ enabled: Boolean(currentUser) });
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllOtherSessions();
  const passkeyOptionsMutation = usePasskeyRegisterOptions();
  const passkeyVerifyMutation = usePasskeyRegisterVerify();

  const [showTotpModal, setShowTotpModal] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  const [totpSuccess, setTotpSuccess] = useState(false);

  const totpEnabled = currentUser?.totpEnabled ?? false;
  const passkeyEnabled = currentUser?.passkeyEnabled ?? false;
  const showEnrollmentSetup = Boolean(
    currentUser && !userLoading && !totpEnabled && !passkeyEnabled,
  );
  const passkeyBrowserSupported = useSyncExternalStore(
    subscribeToPasskeySupport,
    isPasskeySupported,
    getPasskeyServerSupport,
  );

  const handleRegisterPasskey = async () => {
    setPasskeyError(null);
    setPasskeySuccess(false);
    try {
      const serverOptions = await passkeyOptionsMutation.mutateAsync();
      const credential = await startPasskeyRegistration(serverOptions);
      await passkeyVerifyMutation.mutateAsync(credential);
      setPasskeySuccess(true);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setPasskeyError(
        errorObj?.message || "Passkey registration failed. Please try again.",
      );
    }
  };

  const handleTotpSuccess = (codes: string[]) => {
    setShowTotpModal(false);
    setTotpSuccess(true);
    setBackupCodes(codes);
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await revokeSession.mutateAsync(id);
    } catch {
      /* ignore */
    }
  };

  const handleRevokeAll = async () => {
    try {
      await revokeAll.mutateAsync();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="settings-detail" aria-label="Privacy and security settings">
      {showTotpModal && (
        <TotpSetupModal
          onSuccess={handleTotpSuccess}
          onClose={() => setShowTotpModal(false)}
        />
      )}

      {backupCodes && (
        <BackupCodesModal
          codes={backupCodes}
          onClose={() => setBackupCodes(null)}
        />
      )}

      <header className="settings-detail__header">
        <div>
          <h2>Privacy &amp; security</h2>
          <p>Protect your account and control where it is active.</p>
        </div>
      </header>

      {showEnrollmentSetup ? (
        <section
          className="settings-section"
          aria-labelledby="mfa-enrollment-heading"
        >
          <header className="settings-section__heading">
            <ShieldCheck size={20} weight="duotone" />
            <div>
              <h3 id="mfa-enrollment-heading">Secure your account</h3>
              <p>
                Add one passkey or authenticator app to protect your sign-in.
              </p>
            </div>
          </header>

          <div className="settings-row-list">
            {MFA_CONFIG.ALLOW_PASSKEY ? (
              <SettingRow
                className={SECURITY_ROW_CLASS}
                icon={Fingerprint}
                label="Passkey sign-in"
                note={
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <RecommendedBadge />
                    <span>
                      Use your device fingerprint, face, or PIN — no code to
                      type.
                    </span>
                  </span>
                }
              >
                {passkeyBrowserSupported ? (
                  <button
                    aria-busy={
                      passkeyOptionsMutation.isPending ||
                      passkeyVerifyMutation.isPending
                    }
                    className="settings-action"
                    disabled={
                      passkeyOptionsMutation.isPending ||
                      passkeyVerifyMutation.isPending
                    }
                    onClick={handleRegisterPasskey}
                    type="button"
                  >
                    {passkeyOptionsMutation.isPending ||
                    passkeyVerifyMutation.isPending
                      ? "Registering…"
                      : "Register passkey"}
                  </button>
                ) : (
                  <StatusNote>Not supported in this browser</StatusNote>
                )}
              </SettingRow>
            ) : null}

            {MFA_CONFIG.ALLOW_TOTP ? (
              <SettingRow
                className={SECURITY_ROW_CLASS}
                icon={LockKey}
                label="Authenticator app"
                note="Use Google Authenticator, Authy, or any TOTP app as a second factor."
              >
                <button
                  className="settings-action settings-action--quiet"
                  onClick={() => setShowTotpModal(true)}
                  type="button"
                >
                  Set up
                </button>
              </SettingRow>
            ) : null}
          </div>

          {passkeySuccess ? (
            <p className="auth-mfa-setup__success-note" role="status">
              ✓ Passkey registered successfully.
            </p>
          ) : null}

          {passkeyError ? (
            <p className="auth-form__error px-3.5 py-1" role="alert">
              {passkeyError}
            </p>
          ) : null}

          {totpSuccess ? (
            <p className="auth-mfa-setup__success-note" role="status">
              ✓ Authenticator app activated successfully.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          {MFA_CONFIG.ALLOW_PASSKEY && (
            <section
              className="settings-section"
              aria-labelledby="passkey-heading"
            >
              <header className="settings-section__heading">
                <Fingerprint size={20} weight="duotone" />
                <div>
                  <h3 id="passkey-heading">Passkeys</h3>
                  <p>
                    Sign in with your device biometrics or PIN — no code to
                    type.
                  </p>
                </div>
              </header>

              <div className="settings-row-list">
                <SettingRow
                  className={SECURITY_ROW_CLASS}
                  icon={LockKey}
                  label="Passkey sign-in"
                  note={
                    userLoading
                      ? "Loading…"
                      : passkeyEnabled
                        ? "A passkey is registered on this account."
                        : "No passkey registered yet."
                  }
                >
                  {passkeyBrowserSupported ? (
                    <button
                      aria-busy={
                        passkeyOptionsMutation.isPending ||
                        passkeyVerifyMutation.isPending
                      }
                      className="settings-action"
                      disabled={
                        passkeyOptionsMutation.isPending ||
                        passkeyVerifyMutation.isPending
                      }
                      onClick={handleRegisterPasskey}
                      type="button"
                    >
                      {passkeyOptionsMutation.isPending ||
                      passkeyVerifyMutation.isPending
                        ? "Registering…"
                        : passkeyEnabled
                          ? "Replace passkey"
                          : "Register passkey"}
                    </button>
                  ) : (
                    <StatusNote>Not supported in this browser</StatusNote>
                  )}
                </SettingRow>

                {passkeySuccess && (
                  <p className="auth-mfa-setup__success-note" role="status">
                    ✓ Passkey registered successfully.
                  </p>
                )}

                {passkeyError && (
                  <p className="auth-form__error px-3.5 py-1" role="alert">
                    {passkeyError}
                  </p>
                )}
              </div>
            </section>
          )}

          {MFA_CONFIG.ALLOW_TOTP && (
            <section
              className="settings-section"
              aria-labelledby="totp-heading"
            >
              <header className="settings-section__heading">
                <ShieldCheck size={20} weight="duotone" />
                <div>
                  <h3 id="totp-heading">Authenticator app</h3>
                  <p>
                    Use Google Authenticator, Authy, or any TOTP app as a second
                    factor.
                  </p>
                </div>
              </header>

              <div className="settings-row-list">
                <SettingRow
                  className={SECURITY_ROW_CLASS}
                  icon={LockKey}
                  label="Two-factor authentication"
                  note={
                    userLoading
                      ? "Loading…"
                      : totpEnabled
                        ? "Authenticator app is active on this account."
                        : "Add an extra layer of security to your sign-in."
                  }
                >
                  <button
                    className="settings-action"
                    onClick={() => setShowTotpModal(true)}
                    type="button"
                  >
                    {totpEnabled ? "Reconfigure" : "Set up"}
                  </button>
                </SettingRow>

                {totpSuccess && (
                  <p className="auth-mfa-setup__success-note" role="status">
                    ✓ Authenticator app activated successfully.
                  </p>
                )}
              </div>
            </section>
          )}
        </>
      )}

      <section className="settings-section" aria-labelledby="sessions-heading">
        <header className="settings-section__heading">
          <Laptop size={20} weight="duotone" />
          <div>
            <h3 id="sessions-heading">Active sessions</h3>
            <p>See and manage where your account is signed in.</p>
          </div>
        </header>

        {sessionQuery.isLoading && (
          <p className="auth-mfa-setup__loading">Loading sessions…</p>
        )}

        {sessionQuery.isError && (
          <p className="auth-form__error" role="alert">
            Could not load sessions. Please refresh.
          </p>
        )}

        {sessionQuery.data && sessionQuery.data.length > 0 && (
          <>
            <div className="settings-session-list">
              {sessionQuery.data.map((session) => {
                const deviceLabel = session.isCurrent
                  ? "This device"
                  : formatSessionDevice(session.userAgent);

                return (
                  <div className="settings-session" key={session.id}>
                    <span className="settings-session__icon" aria-hidden>
                      {isMobileSession(session.userAgent) ? (
                        <DeviceMobile size={20} weight="duotone" />
                      ) : (
                        <Laptop size={20} weight="duotone" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1 overflow-hidden">
                      <strong title={session.userAgent ?? undefined}>
                        {deviceLabel}
                      </strong>
                      <small>
                        <span className="truncate">
                          {session.ipAddress ?? "Unknown IP"}
                        </span>
                        <span aria-hidden className="shrink-0">
                          ·
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <Timer aria-hidden size={11} />
                          {formatRelativeDate(session.lastUsedAt)}
                        </span>
                      </small>
                    </span>

                    {session.isCurrent ? (
                      <em>Current</em>
                    ) : (
                      <button
                        aria-busy={revokeSession.isPending}
                        className="settings-action settings-action--quiet"
                        disabled={revokeSession.isPending}
                        onClick={() => handleRevokeSession(session.id)}
                        type="button"
                      >
                        <SignOut size={14} /> Sign out
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {sessionQuery.data.some((session) => !session.isCurrent) && (
              <div className="mt-3">
                <button
                  aria-busy={revokeAll.isPending}
                  className="settings-action settings-action--quiet max-sm:w-full"
                  disabled={revokeAll.isPending}
                  onClick={handleRevokeAll}
                  type="button"
                >
                  <X size={14} />{" "}
                  {revokeAll.isPending
                    ? "Signing out…"
                    : "Sign out all other devices"}
                </button>
              </div>
            )}
          </>
        )}

        {sessionQuery.data && sessionQuery.data.length === 0 && (
          <p className="py-3 text-[0.84rem] text-(--muted)">
            No other active sessions found.
          </p>
        )}
      </section>
    </div>
  );
}
