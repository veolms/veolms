import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { PhoneIcon as Phone } from "@phosphor-icons/react/Phone";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ContactChangeResponse, ContactChannel } from "@veolms/contracts";

import { OtpCodeInput } from "../auth/OtpCodeInput";
import { useBackDismiss } from "../navigation/useBackDismiss";
import {
  useConfirmNewContact,
  useProveCurrentContact,
  useSendNewContactCode,
  useStartContactChange,
} from "../services/auth";

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

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
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const codeFieldId = useId();
  const valueFieldId = useId();
  const cardRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState<Step>({ kind: "starting" });
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const startChange = useStartContactChange();
  const proveCurrent = useProveCurrentContact();
  const sendNewCode = useSendNewContactCode();
  const confirmNew = useConfirmNewContact();
  const busy =
    startChange.isPending ||
    proveCurrent.isPending ||
    sendNewCode.isPending ||
    confirmNew.isPending;

  // Closing also steps back over the dialog's history entry, so a Back
  // pressed afterwards leaves the page instead of landing on the dialog.
  const dismiss = useBackDismiss({ open: true, onDismiss: onClose });
  const close = () => dismiss(() => undefined);

  // Focus goes back to what opened the dialog (the Change button).
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  /** Escape closes; Tab and Shift+Tab stay among the dialog's controls. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !cardRef.current) return;
    const focusable = [
      ...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const begin = () =>
    run(async () => {
      const change = await startChange.mutateAsync(channel);
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
      const change = await sendNewCode.mutateAsync({
        changeId: step.change.id,
        value: newValue,
      });
      setCode("");
      setStep({ kind: "newCode", change, value: newValue });
    });

  const submit = () => {
    if (step.kind === "current") {
      return run(async () => {
        const change = await proveCurrent.mutateAsync({
          changeId: step.change.id,
          code,
        });
        setCode("");
        setStep({ kind: "new", change });
      });
    }
    if (step.kind === "new") return sendToNew(value.trim());
    if (step.kind === "newCode") {
      return run(async () => {
        // The account and its sessions are read again (useConfirmNewContact).
        const done = await confirmNew.mutateAsync({
          changeId: step.change.id,
          value: step.value,
          code,
        });
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
        ? "Confirm itâ€™s you"
        : `Change your ${what}`;
  const description =
    step.kind === "starting"
      ? `Sending a code to your current ${what}â€¦`
      : step.kind === "current"
        ? `We sent a 6-digit code to your current ${what}, `
        : step.kind === "newCode"
          ? "We sent a 6-digit code to "
          : step.kind === "new"
            ? `Enter your new ${what}. Weâ€™ll send a code to it to confirm itâ€™s yours.`
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
        ref={cardRef}
        className="settings-profile__verification-dialog-card"
        onKeyDown={onKeyDown}
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
          onClick={close}
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
                ? `Canâ€™t reach your current ${what}? Contact support from the Help Center and our team will change it for you.`
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
                : "Didnâ€™t receive the code?"}
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
              onClick={close}
              autoFocus
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                className="settings-profile__verification-dialog-cancel"
                onClick={close}
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
