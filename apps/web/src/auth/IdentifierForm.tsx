import { useLayoutEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { cn } from "../lib/utils";
import {
  LoginFieldLabel,
  LoginFootnote,
  LoginSubmitButton,
  loginFieldBoxClasses,
  loginInputClasses,
} from "./LoginCardParts";
import { CountryCodeSelect, getDefaultCountry } from "./CountryCodeSelect";
import { IdentifierMethodSwitch } from "./IdentifierMethodSwitch";
import { readIdentifierDraft, saveIdentifierDraft } from "./identifierDraft";
import {
  findCountry,
  findCountryByPhoneNumber,
  normalizeEmail,
  toInternationalPhoneNumber,
  toNationalNumber,
  validateEmail,
  validateMobile,
  withDefaultEmailDomain,
} from "./identifier";
import type { CountryOption, IdentifierMethod } from "./identifier";
import {
  getDefaultLoginMethod,
  isEmailLoginEnabled,
  isMobileLoginEnabled,
  isMethodSwitchVisible,
} from "./authConfig";

export type IdentifierSubmission =
  { method: "email"; email: string } | { method: "mobile"; phoneNo: string };

export interface IdentifierFormProps {
  status: "idle" | "sending";
  disabled?: boolean;
  errorMessage?: string;
  forcedMethod?: IdentifierMethod;
  onSubmit: (submission: IdentifierSubmission) => void;
  /**
   * The visitor typed again: an error the parent shows (`errorMessage`) is
   * cleared there, as this form clears its own.
   */
  onEdit?: () => void;
  /**
   * The submit button's weight: the accent's fill, or the quieter one when
   * another way in leads (the remembered Google account above it).
   */
  submitTone?: "primary" | "secondary";
  /** The submit button's words, when not the login's "Continue with …". */
  submitLabel?: string;
  /** The line under the button, when not the login's. */
  footnote?: ReactNode;
  /** The mobile field's label, when not "Mobile number". */
  mobileLabel?: string;
  /**
   * Where an error is shown: beside the field's label, or in a box under
   * the field, for a message too long for the label's line.
   */
  errorPlacement?: "label" | "below";
  /**
   * A number to start the mobile field with (international form, such as
   * "+918317390847"), in place of what was typed last time.
   */
  initialPhoneNo?: string;
}

const EMAIL_FIELD_ID = "auth-identifier-email";
const MOBILE_FIELD_ID = "auth-identifier-mobile";
const ERROR_ID = "auth-identifier-error";

const DEFAULT_COUNTRY = getDefaultCountry();

export function IdentifierForm({
  status,
  disabled = false,
  errorMessage,
  forcedMethod,
  onSubmit,
  onEdit,
  submitTone = "primary",
  submitLabel,
  footnote,
  mobileLabel = "Mobile number",
  errorPlacement = "label",
  initialPhoneNo,
}: IdentifierFormProps) {
  const sending = status === "sending";
  const locked = sending || disabled;

  const [method, setMethod] = useState<IdentifierMethod>(
    forcedMethod ?? getDefaultLoginMethod(),
  );
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [country, setCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);

  // What was typed before the pop-up last closed is put back (see
  // identifierDraft.ts). After mounting, not in the first state: the login
  // page is built ahead of time with empty fields and must hydrate as such.
  // A layout effect, so a pop-up opening in the browser shows it at once.
  useLayoutEffect(() => {
    const draft = readIdentifierDraft();
    if (draft.email) setEmail(draft.email);
    if (draft.mobile) setMobile(draft.mobile);
    const draftCountry = draft.countryId && findCountry(draft.countryId);
    if (draftCountry) setCountry(draftCountry);
    const initialCountry =
      initialPhoneNo && findCountryByPhoneNumber(initialPhoneNo);
    if (initialPhoneNo && initialCountry) {
      setCountry(initialCountry);
      setMobile(toNationalNumber(initialPhoneNo, initialCountry));
    }
    // The first value only, as with the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const error = invalidReason ?? errorMessage ?? null;
  const labelError = errorPlacement === "label" ? error : null;

  const checkIdentifier = () =>
    method === "email"
      ? validateEmail(withDefaultEmailDomain(email))
      : validateMobile(mobile, country);

  // An address is only judged when the visitor presses Continue, and the
  // verdict goes as soon as they type again: an unfinished address is not
  // an error.
  const edit = (update: () => void) => {
    update();
    setInvalidReason(null);
    onEdit?.();
  };

  const changeMethod = (next: IdentifierMethod) => {
    setMethod(next);
    setInvalidReason(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = checkIdentifier();
    setInvalidReason(message);

    if (message) {
      return;
    }

    onSubmit(
      method === "email"
        ? {
            method: "email",
            email: normalizeEmail(withDefaultEmailDomain(email)),
          }
        : {
            method: "mobile",
            phoneNo: toInternationalPhoneNumber(mobile, country),
          },
    );
  };

  const selectCountry = (next: CountryOption) => {
    edit(() => setCountry(next));
    saveIdentifierDraft({ countryId: next.id });
  };

  const showEmailOnly = forcedMethod
    ? forcedMethod === "email"
    : isEmailLoginEnabled() && !isMobileLoginEnabled();
  const showMobileOnly = forcedMethod
    ? forcedMethod === "mobile"
    : isMobileLoginEnabled() && !isEmailLoginEnabled();
  const showSwitch = !forcedMethod && isMethodSwitchVisible();

  const usingEmail = showEmailOnly || (showSwitch && method === "email");
  const usingMobile = showMobileOnly || (showSwitch && method === "mobile");

  return (
    <form className="flex flex-col gap-3.5" noValidate onSubmit={submit}>
      {showSwitch && (
        <IdentifierMethodSwitch method={method} onMethodChange={changeMethod} />
      )}

      {usingEmail && (
        <div className="flex flex-col gap-2">
          <LoginFieldLabel
            error={labelError}
            errorId={ERROR_ID}
            htmlFor={EMAIL_FIELD_ID}
            label="Email"
          />
          <div className={loginFieldBoxClasses}>
            <input
              aria-describedby={error ? ERROR_ID : undefined}
              aria-invalid={error !== null}
              autoComplete="email"
              className={loginInputClasses}
              disabled={locked}
              id={EMAIL_FIELD_ID}
              inputMode="email"
              name="email"
              onChange={(event) => {
                const value = event.target.value;
                edit(() => setEmail(value));
                saveIdentifierDraft({ email: value });
              }}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </div>
        </div>
      )}

      {usingMobile && (
        <div className="flex flex-col gap-2">
          <LoginFieldLabel
            error={labelError}
            errorId={ERROR_ID}
            htmlFor={MOBILE_FIELD_ID}
            label={mobileLabel}
          />
          <div className="flex min-w-0 items-stretch gap-2.5">
            <CountryCodeSelect
              contentClassName="auth-form__country-menu"
              onCountryChange={selectCountry}
              triggerClassName="auth-form__country h-11.5! min-h-11.5! rounded-[10px]! border-[color-mix(in_srgb,var(--text)_12%,transparent)]! bg-[color-mix(in_srgb,var(--canvas)_45%,var(--surface))]!"
              value={country.id}
            />
            <div className={cn(loginFieldBoxClasses, "flex-1")}>
              <input
                aria-describedby={error ? ERROR_ID : undefined}
                aria-invalid={error !== null}
                autoComplete="tel-national"
                className={loginInputClasses}
                disabled={locked}
                id={MOBILE_FIELD_ID}
                inputMode="numeric"
                name="mobile"
                onChange={(event) => {
                  const value = event.target.value;
                  edit(() => setMobile(value));
                  saveIdentifierDraft({ mobile: value });
                }}
                placeholder="Mobile number"
                type="tel"
                value={mobile}
              />
            </div>
          </div>
        </div>
      )}

      {errorPlacement === "below" && error ? (
        <p
          className="m-0 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3.5 py-2.5 text-[0.8125rem] leading-5 text-(--muted)"
          id={ERROR_ID}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <LoginSubmitButton
        busy={sending}
        busyLabel="Sending code…"
        disabled={disabled}
        label={
          submitLabel ??
          (usingMobile ? "Continue with mobile" : "Continue with email")
        }
        pendingMessage="Sending your sign-in code. Please wait."
        tone={submitTone}
      />
      <LoginFootnote>
        {footnote ??
          (usingMobile
            ? "We'll text you a one-time code. No password needed."
            : "We'll email you a one-time code. No password needed.")}
      </LoginFootnote>
    </form>
  );
}
