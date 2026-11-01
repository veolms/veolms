import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { LaptopIcon as Laptop } from "@phosphor-icons/react/Laptop";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { TimerIcon as Timer } from "@phosphor-icons/react/Timer";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { CurrentUserResponse } from "@veolms/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import {
  clearActiveSessionsVerification,
  readActiveSessionsVerification,
  saveActiveSessionsVerification,
} from "../auth/activeSessionsVerification";
import type { ActiveSessionsVerificationState } from "../auth/activeSessionsVerification";
import type { AuthIdentifier } from "../auth/authFlow";
import { OtpForm } from "../auth/OtpForm";
import {
  authKeys,
  useRevokeAllOtherSessions,
  useRevokeSession,
  useSendActiveSessionsVerificationCode,
  useSessions,
  useVerifyActiveSessionsCode,
} from "../services/auth";
import {
  formatRelativeDate,
  formatSessionDevice,
  isMobileSession,
} from "./sessionDisplay";
import { SettingsModalOverlay } from "./SettingsModalOverlay";

function ActiveSessionsVerificationDialog({
  userId,
  email,
  onClose,
  onVerified,
}: {
  userId: string;
  email: string;
  onClose: () => void;
  onVerified: (state: ActiveSessionsVerificationState) => void;
}) {
  const sendCode = useSendActiveSessionsVerificationCode();
  const verifyCode = useVerifyActiveSessionsCode();
  const { mutate: sendCodeMutation, reset: resetSendCode } = sendCode;
  const { mutate: verifyCodeMutation, reset: resetVerifyCode } = verifyCode;
  const [code, setCode] = useState("");
  const [sendCount, setSendCount] = useState(0);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const initialSendStarted = useRef(false);

  const send = useCallback(() => {
    resetSendCode();
    sendCodeMutation(undefined, {
      onSuccess: () => {
        setSendCount((count) => count + 1);
        setSentAt(Date.now());
      },
    });
  }, [resetSendCode, sendCodeMutation]);

  useEffect(() => {
    if (initialSendStarted.current) return;
    initialSendStarted.current = true;

    setCode("");
    setSendCount(0);
    setSentAt(null);
    resetSendCode();
    resetVerifyCode();
    send();
  }, [resetSendCode, resetVerifyCode, send]);

  const identifier: AuthIdentifier = { method: "email", email };

  return (
    <>
      <div className="auth-mfa-setup__modal-header">
        <h3 id="active-sessions-otp-title">Verify your identity</h3>
        <button
          aria-label="Close verification"
          className="auth-mfa-setup__modal-close"
          disabled={verifyCode.isPending}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden size={18} />
        </button>
      </div>
      <OtpForm
        backLabel="Back to privacy and security"
        code={code}
        errorMessage={sendCode.error?.message ?? verifyCode.error?.message}
        failure={null}
        identifier={identifier}
        onCodeChange={(nextCode) => {
          setCode(nextCode);
          if (verifyCode.isError) verifyCode.reset();
        }}
        onIdentifierChange={onClose}
        onResend={send}
        onSubmit={(submittedCode) => {
          resetVerifyCode();
          verifyCodeMutation(
            { code: submittedCode },
            {
              onSuccess: (result) => {
                onVerified({ userId, verifiedUntil: result.verifiedUntil });
              },
            },
          );
        }}
        resendAvailable={sendCode.isError}
        resending={sendCode.isPending}
        sendCount={sendCount}
        sentAt={sentAt}
        status={verifyCode.isPending ? "verifying" : "idle"}
        subtitle={
          sendCode.isPending
            ? "Sending a verification code to your email address."
            : sendCode.isError
              ? "We couldn't send a code. Please try again."
              : undefined
        }
      />
    </>
  );
}

const SETTINGS_ERROR_TEXT =
  "m-0 text-[0.72rem] leading-[1.4] text-(--danger,#f27991)";

export function ActiveSessionsSection({
  currentUser,
  isAuthenticated,
  userLoading,
}: {
  currentUser: CurrentUserResponse | undefined;
  isAuthenticated: boolean;
  userLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [verification, setVerification] =
    useState<ActiveSessionsVerificationState | null>(null);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const currentUserId = currentUser?.id;

  useEffect(() => {
    if (!isAuthenticated) {
      clearActiveSessionsVerification();
      setVerification(null);
      setVerificationDialogOpen(false);
      return;
    }
    if (userLoading) return;
    if (!currentUserId) {
      clearActiveSessionsVerification();
      setVerification(null);
      setVerificationDialogOpen(false);
      return;
    }

    setVerificationDialogOpen(false);
    setVerification(readActiveSessionsVerification(currentUserId));
  }, [currentUserId, isAuthenticated, userLoading]);

  const hasVerification = Boolean(
    isAuthenticated &&
    currentUser &&
    verification?.userId === currentUser.id &&
    Date.parse(verification.verifiedUntil) > Date.now(),
  );
  const sessionQuery = useSessions({
    enabled: hasVerification,
    userId: currentUser?.id,
  });
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllOtherSessions();

  useEffect(() => {
    if (!hasVerification || !currentUserId || !sessionQuery.isError) return;
    if (
      sessionQuery.error?.status !== 401 &&
      sessionQuery.error?.status !== 403
    ) {
      return;
    }

    clearActiveSessionsVerification();
    setVerification(null);
    queryClient.removeQueries({
      queryKey: authKeys.sessions(currentUserId),
    });
  }, [
    currentUserId,
    hasVerification,
    queryClient,
    sessionQuery.error,
    sessionQuery.isError,
  ]);

  useEffect(() => {
    if (!hasVerification || !currentUser || !verification) return;

    const expiresIn = Date.parse(verification.verifiedUntil) - Date.now();
    const timeout = window.setTimeout(
      () => {
        clearActiveSessionsVerification();
        setVerification(null);
        queryClient.removeQueries({
          queryKey: authKeys.sessions(currentUser.id),
        });
      },
      Math.max(0, expiresIn),
    );

    return () => window.clearTimeout(timeout);
  }, [currentUser, hasVerification, queryClient, verification]);

  const handleVerified = (state: ActiveSessionsVerificationState) => {
    if (!isAuthenticated || currentUser?.id !== state.userId) return;

    saveActiveSessionsVerification(state);
    queryClient.removeQueries({ queryKey: authKeys.sessions(state.userId) });
    setVerification(state);
    setVerificationDialogOpen(false);
  };

  const handleRevokeSession = (id: string) => {
    if (!isAuthenticated) return;
    revokeSession.mutate(id);
  };

  const handleRevokeAll = () => {
    if (!isAuthenticated) return;
    revokeAll.mutate();
  };

  return (
    <>
      <section className="settings-section" aria-labelledby="sessions-heading">
        <header className="settings-section__heading">
          <Laptop size={20} weight="duotone" />
          <div>
            <h3 id="sessions-heading">Active sessions</h3>
            <p>See and manage where your account is signed in.</p>
          </div>
        </header>

        {!isAuthenticated && (
          <p className="py-3 text-[0.84rem] text-(--muted)">
            Sign in to manage active sessions.
          </p>
        )}

        {isAuthenticated && userLoading && (
          <CenteredLoadingSpinner
            label="Checking verification status"
            className="min-h-20 w-full"
            size={22}
          />
        )}

        {isAuthenticated && !userLoading && !hasVerification && (
          <div className="relative mt-3 flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-(--border) bg-(--surface-strong) px-5 py-8 text-center">
            <div className="absolute right-4 top-4 group">
              <button
                aria-describedby="active-sessions-verification-tooltip"
                aria-label="Why is identity verification required?"
                className="rounded-full p-1 text-(--muted) transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                type="button"
              >
                <Info aria-hidden size={18} />
              </button>
              <span
                className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-left text-xs leading-relaxed text-(--text-secondary) opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                id="active-sessions-verification-tooltip"
                role="tooltip"
              >
                Identity verification helps protect details about where your
                account is signed in.
              </span>
            </div>
            <span className="grid size-16 place-items-center rounded-full bg-(--accent-soft) text-(--accent-ink,var(--accent))">
              <ShieldCheck aria-hidden size={32} weight="duotone" />
            </span>
            <div className="flex max-w-md flex-col gap-2">
              <h4 className="m-0 text-lg font-semibold text-(--text)">
                Verify your identity
              </h4>
              <p className="m-0 text-sm leading-relaxed text-(--muted)">
                For your security, verify your identity before viewing your
                active sessions.
              </p>
            </div>
            {currentUser?.email && currentUser.emailVerified ? (
              <button
                className="settings-action"
                onClick={() => setVerificationDialogOpen(true)}
                type="button"
              >
                <LockKey aria-hidden size={16} />
                Verify identity to view sessions
              </button>
            ) : (
              <p className="m-0 max-w-md text-sm text-(--muted)" role="status">
                A verified email address is required to confirm your identity.
              </p>
            )}
          </div>
        )}

        {isAuthenticated && hasVerification && sessionQuery.isLoading && (
          <CenteredLoadingSpinner
            label="Loading active sessions"
            className="min-h-20 w-full"
            size={22}
          />
        )}

        {isAuthenticated && hasVerification && sessionQuery.isError && (
          <div className="flex flex-wrap items-center gap-3 py-3">
            <p className={SETTINGS_ERROR_TEXT} role="alert">
              {sessionQuery.error?.status === 401
                ? "Your sign-in session has expired. Please sign in again."
                : "Could not load active sessions. Please try again."}
            </p>
            <button
              className="settings-action settings-action--quiet"
              disabled={sessionQuery.isFetching}
              onClick={() => void sessionQuery.refetch()}
              type="button"
            >
              {sessionQuery.isFetching ? "Trying again…" : "Retry"}
            </button>
          </div>
        )}

        {revokeSession.isError && (
          <p className={SETTINGS_ERROR_TEXT} role="alert">
            Could not sign out this device. Please try again.
          </p>
        )}

        {revokeAll.isError && (
          <p className={SETTINGS_ERROR_TEXT} role="alert">
            Could not sign out other devices. Please try again.
          </p>
        )}

        {isAuthenticated &&
          hasVerification &&
          sessionQuery.isSuccess &&
          sessionQuery.data &&
          sessionQuery.data.length > 0 && (
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
                            {session.location ??
                              session.ipAddress ??
                              "Unknown IP"}
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
                          disabled={!isAuthenticated || revokeSession.isPending}
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
                    disabled={!isAuthenticated || revokeAll.isPending}
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

        {isAuthenticated &&
          hasVerification &&
          sessionQuery.isSuccess &&
          sessionQuery.data &&
          sessionQuery.data.length === 0 && (
            <p className="py-3 text-[0.84rem] text-(--muted)">
              No other active sessions found.
            </p>
          )}
      </section>
      {isAuthenticated &&
        currentUser &&
        verificationDialogOpen &&
        currentUser.email &&
        currentUser.emailVerified && (
          <SettingsModalOverlay labelledBy="active-sessions-otp-title">
            <div className="auth-mfa-setup__modal">
              <ActiveSessionsVerificationDialog
                email={currentUser.email}
                onClose={() => setVerificationDialogOpen(false)}
                onVerified={handleVerified}
                userId={currentUser.id}
              />
            </div>
          </SettingsModalOverlay>
        )}
    </>
  );
}
