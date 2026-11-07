import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { PhoneIcon as Phone } from "@phosphor-icons/react/Phone";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useQueryClient } from "@tanstack/react-query";
import type { ContactChangeResponse, ContactChannel } from "@veolms/contracts";

import { OtpCodeInput } from "../auth/OtpCodeInput";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { authKeys } from "../services/auth/auth.keys";
import { contactChangeService } from "../services/auth/contact-change.service";

type Step =
  | { kind: "starting" }
  | { kind: "current"; change: ContactChangeResponse }
  | { kind: "new"; change: ContactChangeResponse }
  | { kind: "newCode"; change: ContactChangeResponse; value: string }
  | { kind: "done"; value: string };

const WHAT: Record<ContactChannel, string> = {
  email: "email address",
  phone: "mobile number",
};

function messageOf(error: unknown): string {
  return (
    (error as { message?: string })?.message ||
    "Something went wrong. Please try again."
  );
}

/**
 * Changing the email address or mobile number on one's own account, in
 * three steps: the code sent to the current value, the new value, then the
 * code sent to it. Built from the profile's verification dialog (its card,
 * code boxes and buttons), and like it rendered over the whole page.
 * Someone who can no longer reach the current value is pointed to support.
 */
export function ContactChangeDialog({
  channel,
  onClose,
}: {
  channel: ContactChannel;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const codeFieldId = useId();
  const valueFieldId = useId();
  const [step, setStep] = useState<Step>({ kind: "starting" });
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useBackDismiss({ open: true, onDismiss: onClose });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const begin = () =>
    run(async () => {
      const change = await contactChangeService.start(channel);
      setCode("");
      setStep(
        change.step === "prove_current"
          ? { kind: "current", change }
          : { kind: "new", change },
      );
    });

  // Started once, as the dialog opens. Development runs effects twice, and a
  // second start would send a second code and run into the resend wait.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendToNew = (newValue: string) =>
    run(async () => {
      if (step.kind !== "new" && step.kind !== "newCode") return;
      const change = await contactChangeService.sendToNew(
        step.change.id,
        newValue,
      );
      setCode("");
      setStep({ kind: "newCode", change, value: newValue });
    });

  const submit = () => {
    if (step.kind === "current") {
      return run(async () => {
        const change = await contactChangeService.proveCurrent(
          step.change.id,
          code,
        );
        setCode("");
        setStep({ kind: "new", change });
      });
    }
    if (step.kind === "new") return sendToNew(value.trim());
    if (step.kind === "newCode") {
      return run(async () => {
        const done = await contactChangeService.confirmNew(
          step.change.id,
          step.value,
          code,
        );
        await queryClient.invalidateQueries({ queryKey: authKeys.me() });
        setStep({ kind: "done", value: done.value });
      });
    }
    return undefined;
  };

  const what = WHAT[channel];
  const askingCode = step.kind === "current" || step.kind === "newCode";
  const Icon = channel === "email" ? EnvelopeSimple : Phone;

  const title =
    step.kind === "done"
      ? `${channel === "email" ? "Email address" : "Mobile number"} changed`
      : step.kind === "current"
        ? "Confirm it’s you"
        : `Change your ${what}`;
  const description =
    step.kind === "starting"
      ? `Sending a code to your current ${what}…`
      : step.kind === "current"
        ? `We sent a 6-digit code to your current ${what}, `
        : step.kind === "newCode"
          ? "We sent a 6-digit code to "
          : step.kind === "new"
            ? `Enter your new ${what}. We’ll send a code to it to confirm it’s yours.`
            : "Your other devices were signed out.";
  const sentTo = askingCode ? step.change.sentTo : null;

  return createPortal(
    <div
      className="settings-profile__verification-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <form
        className="settings-profile__verification-dialog-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span
          className="settings-profile__verification-dialog-top-line"
          aria-hidden="true"
        />
        <button
          type="button"
          className="settings-profile__verification-dialog-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={14} weight="bold" />
        </button>

        <div className="settings-profile__verification-dialog-content">
          <div
            className="settings-profile__verification-dialog-icon"
            aria-hidden="true"
          >
            {step.kind === "done" ? (
              <SealCheck size={26} weight="fill" />
            ) : (
              <Icon size={26} />
            )}
          </div>
          <h3 id={titleId}>{title}</h3>
          <p id={descriptionId}>
            {description}
            {sentTo && (
              <>
                <strong>{sentTo}</strong>.
              </>
            )}
            {step.kind === "done" && (
              <>
                {" "}
                Your {what} is now <strong>{step.value}</strong>.
              </>
            )}
          </p>
        </div>

        {askingCode && (
          <div className="settings-profile__verification-dialog-field">
            <label
              className="settings-profile__verification-dialog-field-label"
              htmlFor={codeFieldId}
            >
              Verification code
            </label>
            <OtpCodeInput
              id={codeFieldId}
              describedBy={error ? errorId : descriptionId}
              disabled={busy}
              invalid={Boolean(error)}
              label="Verification code"
              autoFocus
              value={code}
              onChange={setCode}
            />
            <small>
              {step.kind === "current"
                ? `Can’t reach your current ${what}? Contact support from the Help Center and our team will change it for you.`
                : `Enter the code to confirm your new ${what}.`}
            </small>
          </div>
        )}

        {step.kind === "new" && (
          <div className="settings-profile__verification-dialog-field">
            <label
              className="settings-profile__verification-dialog-field-label"
              htmlFor={valueFieldId}
            >
              New {what}
            </label>
            <span className="settings-profile__input-shell">
              <Icon size={17} aria-hidden="true" />
              <input
                id={valueFieldId}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                type={channel === "email" ? "email" : "tel"}
                inputMode={channel === "email" ? "email" : "tel"}
                autoComplete={channel === "email" ? "email" : "tel"}
                placeholder={
                  channel === "email" ? "you@example.com" : "+91 98765 43210"
                }
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
            </span>
          </div>
        )}

        {error ? (
          <p
            id={errorId}
            className="settings-profile__verification-dialog-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {(askingCode || (step.kind === "starting" && error)) && (
          <div className="settings-profile__verification-dialog-resend-row">
            <p>
              {step.kind === "starting"
                ? "The code was not sent."
                : "Didn’t receive the code?"}
            </p>
            <button
              type="button"
              className="settings-profile__verification-dialog-resend"
              onClick={() =>
                void (step.kind === "newCode" ? sendToNew(step.value) : begin())
              }
              disabled={busy}
            >
              {step.kind === "starting" ? "Try again" : "Resend code"}
            </button>
          </div>
        )}

        <div className="settings-profile__verification-dialog-actions">
          {step.kind === "done" ? (
            <button
              type="button"
              className="settings-profile__verification-dialog-submit"
              onClick={onClose}
              autoFocus
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                className="settings-profile__verification-dialog-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="settings-profile__verification-dialog-submit"
                disabled={
                  busy ||
                  step.kind === "starting" ||
                  (askingCode ? code.length !== 6 : !value.trim())
                }
                aria-busy={busy}
              >
                {busy
                  ? step.kind === "new"
                    ? "Sending..."
                    : "Verifying..."
                  : step.kind === "new"
                    ? "Send code"
                    : "Verify OTP"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
