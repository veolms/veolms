import { useEffect, useId, useRef, useState } from "react";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useQueryClient } from "@tanstack/react-query";
import type { ContactChangeResponse, ContactChannel } from "@veolms/contracts";

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
 * code sent to it. Someone who can no longer reach the current value is
 * pointed to support, whose staff change it for them.
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
  const fieldId = useId();
  const [step, setStep] = useState<Step>({ kind: "starting" });
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useBackDismiss({ open: true, onDismiss: onClose });

  const begin = async () => {
    setError(null);
    setBusy(true);
    try {
      const change = await contactChangeService.start(channel);
      setCode("");
      setStep(
        change.step === "prove_current"
          ? { kind: "current", change }
          : { kind: "new", change },
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  // Started once, as the dialog opens. Development runs effects twice, and a
  // second start would send a second code and run into the resend wait.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Another code to the new value, the change otherwise as it was. */
  const resendToNew = async () => {
    if (busy || step.kind !== "newCode") return;
    setError(null);
    setBusy(true);
    try {
      const change = await contactChangeService.sendToNew(
        step.change.id,
        step.value,
      );
      setCode("");
      setStep({ kind: "newCode", change, value: step.value });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (step.kind === "current") {
        const change = await contactChangeService.proveCurrent(
          step.change.id,
          code.trim(),
        );
        setCode("");
        setStep({ kind: "new", change });
      } else if (step.kind === "new") {
        const change = await contactChangeService.sendToNew(
          step.change.id,
          value.trim(),
        );
        setCode("");
        setStep({ kind: "newCode", change, value: value.trim() });
      } else if (step.kind === "newCode") {
        const done = await contactChangeService.confirmNew(
          step.change.id,
          step.value,
          code.trim(),
        );
        await queryClient.invalidateQueries({ queryKey: authKeys.me() });
        setStep({ kind: "done", value: done.value });
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const what = WHAT[channel];
  const askingCode = step.kind === "current" || step.kind === "newCode";
  const sentTo =
    step.kind === "current" || step.kind === "newCode"
      ? step.change.sentTo
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <form
        className="w-full max-w-md rounded-[20px] border border-(--border) bg-(--card-surface) p-6 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="text-lg font-bold tracking-tight text-(--text)"
          >
            Change {what}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>

        {step.kind === "starting" && !error && (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-(--muted)">
            <CircleNotch size={16} className="animate-spin" aria-hidden />
            Sending a code to your current {what}…
          </p>
        )}

        {askingCode && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-(--text-secondary)">
              {step.kind === "current"
                ? `First, confirm it's you: enter the code we sent to your current ${what}, ${sentTo}.`
                : `Now enter the code we sent to ${sentTo}.`}
            </p>
            <label
              htmlFor={fieldId}
              className="mt-4 block text-xs font-semibold text-(--text-secondary)"
            >
              6-digit code
            </label>
            <input
              id={fieldId}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-(--border) bg-(--canvas) px-3 py-2.5 font-mono text-lg tracking-[0.4em] text-(--text) outline-none focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20"
            />
          </>
        )}

        {step.kind === "new" && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-(--text-secondary)">
              Enter your new {what}. We’ll send a code to it to confirm it’s
              yours.
            </p>
            <label
              htmlFor={fieldId}
              className="mt-4 block text-xs font-semibold text-(--text-secondary)"
            >
              New {what}
            </label>
            <input
              id={fieldId}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              type={channel === "email" ? "email" : "tel"}
              inputMode={channel === "email" ? "email" : "tel"}
              autoComplete={channel === "email" ? "email" : "tel"}
              placeholder={
                channel === "email" ? "you@example.com" : "+91 98765 43210"
              }
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-(--border) bg-(--canvas) px-3 py-2.5 text-sm text-(--text) outline-none focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20"
            />
          </>
        )}

        {step.kind === "done" && (
          <div className="mt-4 flex items-start gap-3">
            <SealCheck
              size={22}
              weight="fill"
              className="shrink-0 text-emerald-400"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-(--text-secondary)">
              Your {what} is now <strong>{step.value}</strong>. Your other
              devices were signed out.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-400">
            {error}
          </p>
        )}

        {step.kind === "current" && (
          <p className="mt-3 text-xs text-(--muted)">
            Can’t reach your current {what}? Contact support from the Help
            Center and our team will change it for you.
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {step.kind === "done" ? (
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="cursor-pointer rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--on-accent,#ffffff) hover:opacity-90"
            >
              Done
            </button>
          ) : (
            <>
              {(step.kind === "current" ||
                step.kind === "newCode" ||
                (error && step.kind === "starting")) && (
                <button
                  type="button"
                  onClick={() =>
                    void (step.kind === "newCode" ? resendToNew() : begin())
                  }
                  disabled={busy}
                  className="cursor-pointer rounded-xl border border-(--border) px-4 py-2.5 text-sm font-semibold text-(--text) hover:bg-(--hover) disabled:opacity-60"
                >
                  {step.kind === "starting" ? "Try again" : "Send a new code"}
                </button>
              )}
              {step.kind !== "starting" && (
                <button
                  type="submit"
                  disabled={
                    busy || (askingCode ? code.length !== 6 : !value.trim())
                  }
                  aria-busy={busy}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--on-accent,#ffffff) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy && (
                    <CircleNotch
                      size={15}
                      className="animate-spin"
                      aria-hidden
                    />
                  )}
                  {step.kind === "new" ? "Send code" : "Confirm"}
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}
