import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../icons/Icon.tsx";
import { AuthBrandMark } from "./AuthBrandPanel.tsx";
import { OtpCodeInput } from "./OtpCodeInput.tsx";
import {
  AUTH_CARD_HEADING_ID,
  OTP_ACTION_LABELS,
  OTP_MESSAGES,
  RESEND_COOLDOWN_SECONDS,
  formatResendCountdown,
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
  sendCount: number;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onIdentifierChange: () => void;
}

const CODE_LABEL = "Verification code";
const MESSAGE_ID = "auth-otp-message";
const MILLISECONDS_PER_SECOND = 1000;
const RESEND_WAITING_STATUS = `You can request a new code in ${formatResendCountdown(RESEND_COOLDOWN_SECONDS)}.`;
const RESEND_READY_STATUS = "You can request a new code now.";
const SUBHEADINGS = {
  email: "Enter the 6-digit code sent to your email",
  mobile: "Enter the 6-digit code sent to your mobile number",
} as const;

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
  onCodeChange,
  onIdentifierChange,
  onResend,
  onSubmit,
  sendCount,
  status,
}: OtpFormProps) {
  const verifying = status === "verifying";
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [countedSendCount, setCountedSendCount] = useState(sendCount);
  const [remaining, setRemaining] = useState(RESEND_COOLDOWN_SECONDS);
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

  return (
    <div className="auth-otp-form">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        Verify your OTP
      </h1>
      <p className="auth-card__subheading">{SUBHEADINGS[identifier.method]}</p>

      <div className="auth-otp-form__destination">
        <p className="auth-otp-form__destination-label">Code sent to</p>
        <p className="auth-otp-form__mask">{maskIdentifier(identifier)}</p>
      </div>

      <div className="auth-card__form-slot">
        <form className="auth-form" noValidate onSubmit={submit}>
          <div className="auth-form__field">
            <OtpCodeInput
              describedBy={message === null ? undefined : MESSAGE_ID}
              disabled={verifying}
              invalid={message !== null}
              label={CODE_LABEL}
              onChange={changeCode}
              value={code}
            />

            {message === null ? null : (
              <p className="auth-form__error" id={MESSAGE_ID} role="alert">
                {message.title === null ? null : (
                  <strong className="auth-form__error-title">
                    {message.title}
                  </strong>
                )}
                {message.body}
              </p>
            )}
          </div>

          <div className="auth-otp-form__resend">
            <p className="auth-otp-form__resend-prompt">
              Didn&apos;t receive the code?
            </p>

            <button
              className="auth-otp-form__resend-button"
              disabled={cooling}
              onClick={onResend}
              type="button"
            >
              {cooling
                ? `Resend in ${formatResendCountdown(remaining)}`
                : OTP_ACTION_LABELS.resend}
            </button>

            <p className="auth-otp-form__status" role="status">
              {cooling ? RESEND_WAITING_STATUS : RESEND_READY_STATUS}
            </p>
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

          <button
            className="auth-otp-form__change"
            onClick={onIdentifierChange}
            type="button"
          >
            {identifier.method === "email"
              ? OTP_ACTION_LABELS.changeEmail
              : OTP_ACTION_LABELS.changeMobile}
          </button>
        </form>
      </div>
    </div>
  );
}
