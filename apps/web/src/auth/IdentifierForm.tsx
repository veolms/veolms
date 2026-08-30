import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../icons/Icon";
import { ThemedSelect } from "../ThemedSelect";
import type { ThemedSelectOption } from "../ThemedSelect";
import { CountryFlag } from "./CountryFlag";
import { IdentifierMethodSwitch } from "./IdentifierMethodSwitch";
import {
  DEFAULT_COUNTRY_ID,
  SUPPORTED_COUNTRIES,
  findCountry,
  normalizeEmail,
  toNationalDigits,
  validateEmail,
  validateMobile,
} from "./identifier";
import type { CountryOption, IdentifierMethod } from "./identifier";
import {
  getDefaultLoginMethod,
  isEmailLoginEnabled,
  isMobileLoginEnabled,
  isMethodSwitchVisible,
} from "./authConfig";

export type IdentifierSubmission =
  | { method: "email"; email: string }
  | { method: "mobile"; phoneNo: string };

export interface IdentifierFormProps {
  status: "idle" | "sending";
  errorMessage?: string;
  forcedMethod?: IdentifierMethod;
  onSubmit: (submission: IdentifierSubmission) => void;
}

const COUNTRY_OPTIONS: readonly ThemedSelectOption[] = SUPPORTED_COUNTRIES.map(
  (country) => [
    country.id,
    country.dialCode,
    {
      flag: <CountryFlag code={country.id} />,
      label: `${country.name} (${country.dialCode})`,
      searchKeywords: `${country.name} ${country.dialCode} ${country.id}`,
    },
  ],
);

const EMAIL_FIELD_ID = "auth-identifier-email";
const MOBILE_FIELD_ID = "auth-identifier-mobile";
const ERROR_ID = "auth-identifier-error";

const invalidMark = (
  <Icon
    aria-hidden
    className="auth-form__invalid-mark"
    emphasis="fill"
    name="validationError"
    size={18}
  />
);

function requireDefaultCountry(): CountryOption {
  const country = findCountry(DEFAULT_COUNTRY_ID);

  if (!country) {
    throw new Error("DEFAULT_COUNTRY_ID must name one of SUPPORTED_COUNTRIES.");
  }

  return country;
}

const DEFAULT_COUNTRY = requireDefaultCountry();

function toInternational(value: string, country: CountryOption): string {
  const digits = toNationalDigits(value).slice(-country.nationalDigits);

  return `${country.dialCode}${digits}`;
}

export function IdentifierForm({
  status,
  errorMessage,
  forcedMethod,
  onSubmit,
}: IdentifierFormProps) {
  const sending = status === "sending";

  const [method, setMethod] = useState<IdentifierMethod>(
    forcedMethod ?? getDefaultLoginMethod(),
  );
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [country, setCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);

  const error = invalidReason ?? errorMessage ?? null;

  const checkIdentifier = () =>
    method === "email" ? validateEmail(email) : validateMobile(mobile, country);

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
        ? { method: "email", email: normalizeEmail(email) }
        : { method: "mobile", phoneNo: toInternational(mobile, country) },
    );
  };

  const selectCountry = (id: string) => {
    const next = findCountry(id);

    if (next) {
      setCountry(next);
      setInvalidReason(
        mobile.trim().length > 0 ? validateMobile(mobile, next) : null,
      );
    }
  };

  const showEmailOnly = forcedMethod
    ? forcedMethod === "email"
    : isEmailLoginEnabled() && !isMobileLoginEnabled();
  const showMobileOnly = forcedMethod
    ? forcedMethod === "mobile"
    : isMobileLoginEnabled() && !isEmailLoginEnabled();
  const showSwitch = !forcedMethod && isMethodSwitchVisible();

  return (
    <form className="auth-form" noValidate onSubmit={submit}>
      {showSwitch && (
        <div className="auth-form__method">
          <p className="auth-form__section-label">Continue with</p>
          <IdentifierMethodSwitch method={method} onMethodChange={changeMethod} />
          <p className="auth-form__helper">We&apos;ll send you a one-time code</p>
        </div>
      )}

      {showEmailOnly && (
        <div className="auth-form__method">
          <p className="auth-form__section-label">Continue with email</p>
          <p className="auth-form__helper">We&apos;ll send you a one-time code</p>
        </div>
      )}

      {showMobileOnly && (
        <div className="auth-form__method">
          <p className="auth-form__section-label">Continue with mobile</p>
          <p className="auth-form__helper">We&apos;ll send you a one-time code</p>
        </div>
      )}

      {(showEmailOnly || (showSwitch && method === "email")) && (
        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor={EMAIL_FIELD_ID}>
            Email address
          </label>

          <div className="auth-form__input-shell">
            <Icon aria-hidden name="email" size={18} />
            <input
              aria-describedby={error ? ERROR_ID : undefined}
              aria-invalid={error !== null}
              autoComplete="email"
              className="auth-form__input"
              id={EMAIL_FIELD_ID}
              inputMode="email"
              name="email"
              onBlur={() => setInvalidReason(checkIdentifier())}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email address"
              type="email"
              value={email}
            />
            {error ? invalidMark : null}
          </div>

          {error ? (
            <p className="auth-form__error" id={ERROR_ID} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}

      {(showMobileOnly || (showSwitch && method === "mobile")) && (
        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor={MOBILE_FIELD_ID}>
            Mobile number
          </label>

          <div className="auth-form__mobile-row">
            <ThemedSelect
              ariaLabel="Country code"
              contentClassName="auth-form__country-menu"
              onValueChange={selectCountry}
              options={COUNTRY_OPTIONS}
              searchable
              searchPlaceholder="Search country or code..."
              triggerClassName="auth-form__country"
              value={country.id}
            />

            <div className="auth-form__input-shell">
              <Icon aria-hidden name="mobile" size={18} />
              <input
                aria-describedby={error ? ERROR_ID : undefined}
                aria-invalid={error !== null}
                autoComplete="tel-national"
                className="auth-form__input"
                id={MOBILE_FIELD_ID}
                inputMode="numeric"
                name="mobile"
                onBlur={() => setInvalidReason(checkIdentifier())}
                onChange={(event) => setMobile(event.target.value)}
                placeholder="Enter your mobile number"
                type="tel"
                value={mobile}
              />
              {error ? invalidMark : null}
            </div>
          </div>

          {error ? (
            <p className="auth-form__error" id={ERROR_ID} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}

      <button
        aria-busy={sending}
        className="auth-form__submit"
        disabled={sending}
        type="submit"
      >
        <span className="auth-form__submit-label">
          {sending ? "Sending..." : "Continue"}
        </span>
        <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
      </button>
    </form>
  );
}
