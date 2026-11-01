import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/utils";
import {
  LoginFieldError,
  LoginHeading,
  LoginSubmitButton,
  loginCardCornerButtonClasses,
  loginLinkClasses,
} from "./LoginCardParts";
import { OtpCodeInput } from "./OtpCodeInput.tsx";
import {
  OTP_MESSAGES,
  RESEND_COOLDOWN_SECONDS,
  maskIdentifier,
  validateOtpCode,
} from "./authFlow.ts";
import type {
  AuthIdentifier,
  OtpFailureReason,
  OtpMessage,
} from "./authFlow.ts";

export interface OtpFormProps {
  identifier: AuthIdentifier;
  code: string;
  onCodeChange: (code: string) => void;
  status: "idle" | "verifying";
  failure: OtpFailureReason | null;
  errorMessage?: string | null;
  /** Replaces the line under the heading, e.g. when the code was sent earlier. */
  notice?: string | null;
  /** The whole line under the heading, in place of the one built here. */
  subtitle?: ReactNode;
  /**
   * When the code on its way was sent (epoch milliseconds), if known. The
   * wait before another can be requested runs from then, not from when this
   * form appeared.
   */
  sentAt?: number | null;
  sendCount: number;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onIdentifierChange: () => void;
  resending?: boolean;
  /** The button's words, when not "Verify". */
  submitLabel?: string;
}

const CODE_LABEL = "Verification code";
const MESSAGE_ID = "auth-otp-message";
const MILLISECONDS_PER_SECOND = 1000;

/** "0:58": minutes and seconds, as the wait reads on the card. */
function formatWait(seconds: number): string {
  const whole = Math.max(0, seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Seconds left before another code may be requested. This form is taken off
 * the page and put back as the visitor moves between steps (to the name step
 * and back, or closing and reopening the login pop-up). Counting from when
 * it appeared made each return start a full wait again, although the server
 * counts from the send.
 */
function resendSecondsLeft(sentAt: number | null | undefined): number {
  if (sentAt === null || sentAt === undefined) return RESEND_COOLDOWN_SECONDS;
  const elapsed = Math.floor((Date.now() - sentAt) / MILLISECONDS_PER_SECOND);
  return Math.min(
    RESEND_COOLDOWN_SECONDS,
    Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed),
  );
}

function resolveMessage(
  invalidReason: string | null,
  failure: OtpFailureReason | null,
  errorMessage?: string | null,
): OtpMessage | null {
  if (invalidReason !== null) {
    return { title: null, body: invalidReason };
  }

  if (errorMessage) {
    return { title: null, body: errorMessage };
  }

  return failure === null ? null : OTP_MESSAGES[failure];
}

export function OtpForm({
  code,
  failure,
  errorMessage,
  identifier,
  notice,
  subtitle,
  onCodeChange,
  onIdentifierChange,
  onResend,
  onSubmit,
  resending = false,
  submitLabel = "Verify",
  sendCount,
  sentAt,
  status,
}: OtpFormProps) {
  const verifying = status === "verifying";
  // The first code can still be on its way (sent as the step opened).
  const sendingLabel =
    sendCount > 1 ? "Sending a new code…" : "Sending a code…";
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [countedSendCount, setCountedSendCount] = useState(sendCount);
  const [remaining, setRemaining] = useState(() => resendSecondsLeft(sentAt));
  const message = resolveMessage(invalidReason, failure, errorMessage);

  if (countedSendCount !== sendCount) {
    setCountedSendCount(sendCount);
    setRemaining(RESEND_COOLDOWN_SECONDS);
  }

  const cooling = remaining > 0;

  useEffect(() => {
    if (!cooling) {
      return;
    }

    const ticker = setInterval(() => {
      setRemaining((seconds) => Math.max(0, seconds - 1));
    }, MILLISECONDS_PER_SECOND);

    return () => clearInterval(ticker);
  }, [cooling]);

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

  const byEmail = identifier.method === "email";
  const destination = (
    <span className="font-semibold text-(--text)">
      {maskIdentifier(identifier)}
    </span>
  );

  return (
    <div className="flex w-full flex-col gap-6.5">
      <button
        aria-label={
          byEmail
            ? "Back, use a different email"
            : "Back, use a different number"
        }
        className={cn(loginCardCornerButtonClasses, "left-3.5")}
        disabled={resending || verifying}
        onClick={onIdentifierChange}
        type="button"
      >
        <CaretLeft aria-hidden size={18} weight="bold" />
      </button>

      <div className="flex flex-col items-center gap-4.5 pt-2.5">
        <span
          aria-hidden="true"
          className="grid size-13 place-items-center rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent-ink,var(--accent))"
        >
          <Icon aria-hidden name={byEmail ? "email" : "mobile"} size={24} />
        </span>
        <LoginHeading
          centered
          title={byEmail ? "Check your email" : "Check your phone"}
          subtitle={
            subtitle ??
            (notice ? (
              <>We already sent a code to {destination}. Enter it below.</>
            ) : (
              <>We sent a 6-digit code to {destination}</>
            ))
          }
        />
      </div>

      <form className="flex flex-col gap-3.5" noValidate onSubmit={submit}>
        <OtpCodeInput
          describedBy={message === null ? undefined : MESSAGE_ID}
          disabled={verifying || resending}
          invalid={message !== null}
          label={CODE_LABEL}
          look="login"
          autoFocus
          onChange={changeCode}
          value={code}
        />

        {message === null ? null : (
          <LoginFieldError id={MESSAGE_ID}>
            {message.title === null ? null : (
              <strong className="block font-semibold">{message.title}</strong>
            )}
            {message.body}
          </LoginFieldError>
        )}

        <LoginSubmitButton
          busy={verifying || resending}
          busyLabel={resending ? sendingLabel : "Verifying…"}
          className="mt-1.5"
          label={submitLabel}
          pendingMessage={
            verifying
              ? "Checking your code. Please wait."
              : `${sendingLabel.slice(0, -1)}. Please wait.`
          }
        />
      </form>

      <div className="flex flex-col items-center gap-2.5 text-center">
        <p
          className="m-0 text-[0.84375rem] leading-5 text-(--muted)"
          role="status"
        >
          Didn&apos;t get it?{" "}
          {resending ? (
            <span className="text-[color-mix(in_srgb,var(--muted)_78%,var(--surface))]">
              {sendingLabel}
            </span>
          ) : cooling ? (
            <span className="text-[color-mix(in_srgb,var(--muted)_78%,var(--surface))]">
              Resend in {formatWait(remaining)}
            </span>
          ) : (
            <button
              className={loginLinkClasses}
              disabled={verifying}
              onClick={onResend}
              type="button"
            >
              Resend code
            </button>
          )}
        </p>
        <button
          className={loginLinkClasses}
          disabled={resending || verifying}
          onClick={onIdentifierChange}
          type="button"
        >
          {byEmail ? "Use a different email" : "Use a different number"}
        </button>
      </div>
    </div>
  );
}
