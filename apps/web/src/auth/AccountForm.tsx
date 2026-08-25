import { useState } from "react";
import type { FormEvent } from "react";
import { registerRequestSchema } from "@veolms/contracts";
import { Icon } from "../icons/Icon.tsx";
import { productName } from "../routing/routeDescriptors.ts";
import { AuthBrandMark } from "./AuthBrandPanel.tsx";
import { AUTH_CARD_HEADING_ID, maskIdentifier } from "./authFlow.ts";
import type { AuthIdentifier } from "./authFlow.ts";

export interface AccountFormProps {
  identifier: AuthIdentifier;
  secondaryIdentifier?: AuthIdentifier;
  name: string;
  onNameChange: (name: string) => void;
  status: "idle" | "creating";
  errorMessage?: string;
  onSubmit: (name: string) => void;
  onBackToOtp?: () => void;
  onIdentifierChange?: () => void;
}

const ACTION_LABELS = {
  create: "Create account",
  creating: "Creating account...",
} as const;

const ERROR_ID = "auth-account-error";
const NAME_FIELD_ID = "auth-account-name";
const NAME_LABEL = "Your name";
const NAME_REQUIRED_MESSAGE = "Please enter your name.";
const NAME_TOO_LONG_MESSAGE = "Please use a shorter name.";

function validateName(value: string): string | null {
  const trimmed = value.trim();
  const result = registerRequestSchema.shape.displayName.safeParse(trimmed);

  if (result.success) {
    return null;
  }

  return trimmed.length === 0 ? NAME_REQUIRED_MESSAGE : NAME_TOO_LONG_MESSAGE;
}

export function AccountForm({
  errorMessage,
  identifier,
  secondaryIdentifier,
  name,
  onBackToOtp,
  onIdentifierChange,
  onNameChange,
  onSubmit,
  status,
}: AccountFormProps) {
  const creating = status === "creating";
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const error = invalidReason ?? errorMessage ?? null;

  const changeName = (next: string) => {
    setInvalidReason(null);
    onNameChange(next);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = validateName(name);
    setInvalidReason(message);

    if (message) {
      return;
    }

    onSubmit(name.trim());
  };

  return (
    <div className="auth-account-form">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        Welcome to {productName} <span aria-hidden="true">👋</span>
      </h1>
      <p className="auth-card__subheading">
        Let&apos;s finish setting up your account
      </p>

      <div style={{ display: "grid", gap: "6px", width: "100%" }}>
        <p className="auth-account-form__verified" style={{ margin: 0 }}>
          <Icon aria-hidden emphasis="bold" name="verified" size={16} />
          <span className="auth-account-form__verified-mask">
            {maskIdentifier(identifier)}
          </span>
          <span className="auth-account-form__verified-state">verified</span>
        </p>

        {secondaryIdentifier && (
          <p className="auth-account-form__verified" style={{ margin: 0 }}>
            <Icon aria-hidden emphasis="bold" name="verified" size={16} />
            <span className="auth-account-form__verified-mask">
              {maskIdentifier(secondaryIdentifier)}
            </span>
            <span className="auth-account-form__verified-state">verified</span>
          </p>
        )}
      </div>

      <div className="auth-card__form-slot">
        <form className="auth-form" noValidate onSubmit={submit}>
          <div className="auth-form__field">
            <label className="auth-account-form__label" htmlFor={NAME_FIELD_ID}>
              {NAME_LABEL}
            </label>

            <div className="auth-form__input-shell">
              <Icon aria-hidden name="person" size={18} />
              <input
                aria-describedby={error ? ERROR_ID : undefined}
                aria-invalid={error !== null}
                autoComplete="name"
                className="auth-form__input"
                id={NAME_FIELD_ID}
                name="name"
                onChange={(event) => changeName(event.target.value)}
                placeholder="Enter your name"
                type="text"
                value={name}
              />
              {error ? (
                <Icon
                  aria-hidden
                  className="auth-form__invalid-mark"
                  emphasis="fill"
                  name="validationError"
                  size={18}
                />
              ) : null}
            </div>

            {error ? (
              <p className="auth-form__error" id={ERROR_ID} role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <button
            aria-busy={creating}
            className="auth-form__submit"
            disabled={creating}
            type="submit"
          >
            <span className="auth-form__submit-label">
              {creating ? ACTION_LABELS.creating : ACTION_LABELS.create}
            </span>
            <Icon aria-hidden emphasis="bold" name="arrowRight" size={18} />
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
            {onBackToOtp ? (
              <button
                className="auth-otp-form__change"
                onClick={onBackToOtp}
                type="button"
              >
                Re-enter verification code
              </button>
            ) : null}

            {onIdentifierChange ? (
              <button
                className="auth-otp-form__change"
                onClick={onIdentifierChange}
                type="button"
              >
                {identifier.method === "email"
                  ? "Change email address"
                  : "Change mobile number"}
              </button>
            ) : null}
          </div>

          <p className="auth-account-form__legal">
            By creating an account, you agree to our{" "}
            <button className="auth-account-form__legal-action" type="button">
              Terms of Service
            </button>{" "}
            and{" "}
            <button className="auth-account-form__legal-action" type="button">
              Privacy Policy
            </button>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
