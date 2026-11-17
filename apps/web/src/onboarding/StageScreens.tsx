import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { RocketLaunchIcon as RocketLaunch } from "@phosphor-icons/react/RocketLaunch";
import type { AcademyAddressState, OnboardingAcademy } from "@veolms/contracts";
import type { FormEvent, ReactNode, Ref } from "react";
import { GoogleSignInButton } from "../auth/GoogleSignInButton";
import { CountryCodeSelect } from "../auth/CountryCodeSelect";
import type { CountryOption, IdentifierMethod } from "../auth/identifier";
import { IdentifierMethodSwitch } from "../auth/IdentifierMethodSwitch";
import {
  LoginDivider,
  LoginFieldError,
  LoginFieldLabel,
  LoginSubmitButton,
  loginButtonClasses,
  loginInputClasses,
  loginLabelClasses,
} from "../auth/LoginCardParts";
import { OtpCodeInput } from "../auth/OtpCodeInput";
import { Button } from "../components/Button";
import { CheckboxIndicator } from "../components/Checkbox";
import { cn } from "../lib/utils";
import { academyThemes, DEFAULT_ACADEMY_THEME } from "../themes";
import {
  AcademyInitials,
  LaunchButton,
  StageDock,
  StageQuestion,
  stageFieldBoxClasses,
  stageFocusClasses,
} from "./StagePieces";

/** The light's own room in the middle of each screen. */
export function StageArt({
  ref,
  children,
}: {
  ref: Ref<HTMLDivElement>;
  children?: ReactNode;
}) {
  return (
    <div ref={ref} className="relative z-1 min-h-30 flex-1">
      {children}
    </div>
  );
}

const busyIcon = (
  <CircleNotch
    size={16}
    weight="bold"
    className="animate-spin motion-reduce:animate-none"
    aria-hidden="true"
  />
);

const stepLabel = (n: number) => `Step ${n} of 3`;

// ─── Step 1: email or mobile ──────────────────────────────────────────────

export type ContactMethod = IdentifierMethod;

const CONTACT_ERROR_ID = "stage-contact-error";

/**
 * Step 1, built from the login card's own parts: Google, the email or
 * mobile switch, the country code picker, the field with its error on the
 * label line, and the send button.
 */
export function ContactScreen({
  questionRef,
  artRef,
  method,
  showMethodSwitch,
  onMethodChange,
  email,
  onEmailChange,
  mobile,
  onMobileChange,
  country,
  onCountryChange,
  error,
  sending,
  onSubmit,
  google,
}: {
  questionRef: Ref<HTMLDivElement>;
  artRef: Ref<HTMLDivElement>;
  method: ContactMethod;
  showMethodSwitch: boolean;
  onMethodChange: (method: ContactMethod) => void;
  email: string;
  onEmailChange: (value: string) => void;
  mobile: string;
  onMobileChange: (value: string) => void;
  country: CountryOption;
  onCountryChange: (country: CountryOption) => void;
  error: string | null;
  sending: boolean;
  onSubmit: () => void;
  /** Shown when the site signs in with Google. */
  google: { busy: boolean; onClick: () => void } | null;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <>
      <StageQuestion
        ref={questionRef}
        eyebrow={stepLabel(1)}
        title="How do we reach you?"
      >
        We&rsquo;ll send you a one-time code. No passwords, ever.
      </StageQuestion>
      <StageArt ref={artRef} />
      <StageDock as="form" noValidate onSubmit={submit}>
        {google ? (
          <>
            <GoogleSignInButton
              busyLabel={google.busy ? "Signing you in…" : null}
              disabled={google.busy || sending}
              onClick={google.onClick}
            />
            <LoginDivider />
          </>
        ) : null}
        {showMethodSwitch ? (
          // The sign-in card's switch, sized as there, with the chosen
          // method raised a step rather than filled with the neon.
          <div className="[--auth-h-switch:42px] [--auth-radius-switch:12px] [&_[aria-selected=true]]:bg-[color-mix(in_srgb,var(--text)_13%,transparent)]! [&_[aria-selected=true]]:text-(--text)!">
            <IdentifierMethodSwitch
              method={method}
              onMethodChange={onMethodChange}
              methods={["email", "mobile"]}
            />
          </div>
        ) : null}
        {method === "email" ? (
          <div className="flex flex-col gap-2">
            <LoginFieldLabel
              error={error}
              errorId={CONTACT_ERROR_ID}
              htmlFor="stage-email"
              label="Email"
            />
            <div className={stageFieldBoxClasses}>
              <input
                id="stage-email"
                className={loginInputClasses}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@procodrr.com"
                value={email}
                aria-invalid={error !== null}
                aria-describedby={error ? CONTACT_ERROR_ID : undefined}
                onChange={(event) => onEmailChange(event.target.value)}
                disabled={sending}
                autoFocus
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <LoginFieldLabel
              error={error}
              errorId={CONTACT_ERROR_ID}
              htmlFor="stage-mobile"
              label="Mobile number"
            />
            <div className="flex min-w-0 items-stretch gap-2.5">
              <CountryCodeSelect
                contentClassName="auth-form__country-menu"
                menuAlign="start"
                onCountryChange={onCountryChange}
                triggerClassName="auth-form__country h-11.5! min-h-11.5! shrink-0! gap-1.5! px-3! whitespace-nowrap! rounded-[10px]! border! border-solid! border-[color-mix(in_srgb,var(--text)_10%,transparent)]! bg-[color-mix(in_srgb,var(--canvas)_45%,var(--surface))]! shadow-none! hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]!"
                value={country.id}
                disabled={sending}
              />
              <div className={cn(stageFieldBoxClasses, "flex-1")}>
                <input
                  id="stage-mobile"
                  className={loginInputClasses}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  value={mobile}
                  aria-invalid={error !== null}
                  aria-describedby={error ? CONTACT_ERROR_ID : undefined}
                  onChange={(event) => onMobileChange(event.target.value)}
                  disabled={sending}
                  autoFocus
                />
              </div>
            </div>
          </div>
        )}
        <LoginSubmitButton
          label="Send code"
          busy={sending}
          busyLabel="Sending code…"
          pendingMessage="Sending your code"
        />
      </StageDock>
    </>
  );
}

// ─── Step 1: the code ─────────────────────────────────────────────────────

export function CodeScreen({
  questionRef,
  artRef,
  sentTo,
  code,
  onCodeChange,
  error,
  checking,
  onSubmit,
  onBack,
  resend,
}: {
  questionRef: Ref<HTMLDivElement>;
  artRef: Ref<HTMLDivElement>;
  sentTo: string;
  code: string;
  onCodeChange: (code: string) => void;
  error: string | null;
  checking: boolean;
  onSubmit: () => void;
  onBack: () => void;
  resend: { busy: boolean; onClick: () => void };
}) {
  return (
    <>
      <StageQuestion
        ref={questionRef}
        eyebrow={stepLabel(1)}
        title="Enter your code"
      >
        We sent 6 digits to <b className="text-(--text)">{sentTo}</b>
      </StageQuestion>
      <StageArt ref={artRef} />
      <StageDock
        as="form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid gap-2">
          <OtpCodeInput
            look="login"
            label="6-digit code"
            value={code}
            onChange={onCodeChange}
            disabled={checking}
            invalid={Boolean(error)}
            describedBy={error ? "stage-code-error" : undefined}
            autoFocus
          />
          {error ? (
            <div className="text-center">
              <LoginFieldError id="stage-code-error">{error}</LoginFieldError>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-sm font-semibold text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)] hover:text-(--text)",
              stageFocusClasses,
            )}
          >
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            Change
          </button>
          <button
            type="button"
            onClick={resend.onClick}
            disabled={resend.busy || checking}
            className={cn(
              "h-10 rounded-lg border-0 bg-transparent px-2 text-sm font-semibold text-(--muted) underline-offset-2 hover:text-(--text) hover:underline disabled:opacity-50",
              stageFocusClasses,
            )}
          >
            {resend.busy ? "Sending…" : "Send again"}
          </button>
          <span className="flex-1" />
          <Button type="submit" disabled={code.length < 6 || checking}>
            {checking ? "Checking…" : "Verify"}
            {checking ? (
              busyIcon
            ) : (
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            )}
          </Button>
        </div>
      </StageDock>
    </>
  );
}

// ─── Welcome back ─────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function statusLabel(academy: OnboardingAcademy): string {
  if (academy.status === "suspended") return "Paused";
  if (academy.status === "trial" && academy.trialEndsAt) {
    const days = Math.max(
      0,
      Math.ceil((Date.parse(academy.trialEndsAt) - Date.now()) / DAY_MS),
    );
    return days > 0
      ? `Trial · ${days} ${days === 1 ? "day" : "days"} left`
      : "Trial ended";
  }
  return "Live";
}

const defaultTheme =
  academyThemes.find((theme) => theme.id === DEFAULT_ACADEMY_THEME) ??
  academyThemes[0]!;

export function WelcomeScreen({
  questionRef,
  artRef,
  academies,
  opening,
  canStartAnother,
  maxAcademies,
  onOpen,
  onStartAnother,
}: {
  questionRef: Ref<HTMLDivElement>;
  artRef: Ref<HTMLDivElement>;
  academies: OnboardingAcademy[];
  opening: string | null;
  canStartAnother: boolean;
  maxAcademies: number;
  onOpen: (academy: OnboardingAcademy) => void;
  onStartAnother: () => void;
}) {
  const count = academies.length;
  const counted =
    count === 1
      ? "an academy"
      : count === 2
        ? "two academies"
        : `${count} academies`;
  return (
    <>
      <StageQuestion
        ref={questionRef}
        eyebrow="Welcome back"
        title="Good to see you again."
      >
        You already run {counted}. Open {count === 1 ? "it" : "one"}
        {canStartAnother ? ", or start another." : "."}
      </StageQuestion>
      <StageArt ref={artRef} />
      <StageDock>
        <ul className="m-0 grid list-none gap-2 p-0">
          {academies.map((academy) => (
            <li key={academy.id}>
              <button
                type="button"
                onClick={() => onOpen(academy)}
                disabled={opening !== null}
                aria-busy={opening === academy.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-3 text-left transition-colors hover:bg-(--hover) disabled:cursor-progress",
                  stageFocusClasses,
                )}
              >
                {/* Each academy in its own colour: the default until it picks one. */}
                <AcademyInitials
                  name={academy.name}
                  size={38}
                  style={{
                    background: defaultTheme.preview,
                    color: defaultTheme.darkInk ? "#0b1020" : "#ffffff",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px] text-(--text)">
                    {academy.name}
                  </b>
                  <span className="block truncate text-[12.5px] text-(--muted)">
                    {academy.host}
                  </span>
                </span>
                <span className="inline-flex h-5.5 items-center rounded-full bg-(--accent-soft) px-2 text-[11.5px] font-bold whitespace-nowrap text-(--accent-ink,var(--accent))">
                  {statusLabel(academy)}
                </span>
                {opening === academy.id ? (
                  busyIcon
                ) : (
                  <CaretRight size={16} weight="bold" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
        {canStartAnother ? (
          <button
            type="button"
            onClick={onStartAnother}
            disabled={opening !== null}
            className={cn(
              loginButtonClasses.base,
              loginButtonClasses.secondary,
            )}
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            Start another academy
          </button>
        ) : (
          <p className="m-0 text-center text-[12.5px] text-(--muted)">
            You run the most academies one account can ({maxAcademies}).
          </p>
        )}
      </StageDock>
    </>
  );
}

// ─── Step 2: name and address ─────────────────────────────────────────────

export type AddressState = AcademyAddressState | "idle" | "checking" | "error";

const ADDRESS_MESSAGES: Partial<Record<AddressState, string>> = {
  taken: "Someone already has this one",
  reserved: "This address is reserved",
  short: "At least 3 letters or numbers",
  invalid: "Only letters and numbers",
  error: "Couldn’t check this address",
};

const POLICY_LINKS: readonly [string, string][] = [
  ["Terms", "/terms"],
  ["Acceptable use", "/community-guidelines"],
  ["Privacy", "/privacy"],
  ["Data processing", "/policies"],
];

export function DetailsScreen({
  questionRef,
  artRef,
  name,
  onNameChange,
  slug,
  onSlugChange,
  domain,
  addressState,
  suggestions,
  onPickSuggestion,
  agreed,
  onAgreedChange,
  saving,
  error,
  canContinue,
  onBack,
  onContinue,
}: {
  questionRef: Ref<HTMLDivElement>;
  artRef: Ref<HTMLDivElement>;
  name: string;
  onNameChange: (name: string) => void;
  slug: string;
  onSlugChange: (slug: string) => void;
  domain: string;
  addressState: AddressState;
  suggestions: string[];
  onPickSuggestion: (slug: string) => void;
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
  saving: boolean;
  error: string | null;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const problem = ADDRESS_MESSAGES[addressState];
  return (
    <>
      <StageQuestion
        ref={questionRef}
        eyebrow={stepLabel(2)}
        title="Name your academy."
      >
        Watch it come to life as you type.
      </StageQuestion>
      <StageArt ref={artRef} />
      <StageDock
        as="form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (canContinue) onContinue();
        }}
      >
        <div className="grid gap-1.5">
          <label className={loginLabelClasses} htmlFor="stage-academy-name">
            Academy name
          </label>
          <div className={cn(stageFieldBoxClasses, "h-14.5")}>
            <input
              id="stage-academy-name"
              className={cn(
                loginInputClasses,
                "text-xl! font-bold! tracking-[-0.01em]",
              )}
              placeholder="e.g. ProCodrr"
              autoComplete="organization"
              maxLength={60}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              autoFocus={!name}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <div className="flex min-h-5 items-end justify-between gap-2.5">
            <label className={loginLabelClasses} htmlFor="stage-address">
              Your address
            </label>
            <span
              id="stage-address-status"
              aria-live="polite"
              className="text-xs leading-4 font-semibold"
            >
              {addressState === "checking" ? (
                <span className="inline-flex items-center gap-1 font-medium text-(--muted)">
                  <CircleNotch
                    size={13}
                    weight="bold"
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Checking…
                </span>
              ) : addressState === "ok" ? (
                <span className="inline-flex items-center gap-1 text-(--success) [:root[data-theme=light]_&]:text-[#15803d]">
                  <CheckCircle size={14} weight="fill" aria-hidden="true" />
                  It&rsquo;s yours
                </span>
              ) : problem ? (
                <span className="text-(--danger)">{problem}</span>
              ) : null}
            </span>
          </div>
          <div className={stageFieldBoxClasses}>
            <input
              id="stage-address"
              className={loginInputClasses}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="youracademy"
              value={slug}
              maxLength={30}
              aria-invalid={
                problem && addressState !== "error" ? true : undefined
              }
              aria-describedby="stage-address-status"
              onChange={(event) => onSlugChange(event.target.value)}
            />
            <span className="text-[15px] font-medium whitespace-nowrap text-(--muted)">
              .{domain}
            </span>
          </div>
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Free addresses">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="quiet"
                  elevation="flat"
                  onClick={() => onPickSuggestion(suggestion)}
                  className="h-8! px-3! text-[13px]!"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <label className="group relative flex cursor-pointer items-start gap-2.5 text-left text-[13px] leading-4.75 text-(--text-secondary)">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={agreed}
            onChange={(event) => onAgreedChange(event.target.checked)}
          />
          <CheckboxIndicator
            checked={agreed}
            className="mt-px peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent)"
          />
          <span>
            I agree to the{" "}
            {POLICY_LINKS.map(([label, href], index) => (
              <span key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-(--accent-ink,var(--accent)) hover:underline"
                >
                  {label}
                </a>
                {index < POLICY_LINKS.length - 2
                  ? ", "
                  : index === POLICY_LINKS.length - 2
                    ? " and "
                    : ""}
              </span>
            ))}{" "}
            policies.
          </span>
        </label>
        {error ? (
          <LoginFieldError id="stage-details-error">{error}</LoginFieldError>
        ) : null}
        <div className="flex items-center gap-2">
          <Button variant="quiet" aria-label="Back" onClick={onBack}>
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          </Button>
          <span className="flex-1" />
          <Button type="submit" disabled={!canContinue || saving}>
            {saving ? "Saving…" : "Continue"}
            {saving ? (
              busyIcon
            ) : (
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            )}
          </Button>
        </div>
      </StageDock>
    </>
  );
}

// ─── Step 3: launch ───────────────────────────────────────────────────────

export function LaunchScreen({
  questionRef,
  artRef,
  name,
  host,
  freeUntil,
  launching,
  leaving,
  launchRef,
  onBack,
  onLaunch,
}: {
  questionRef: Ref<HTMLDivElement>;
  artRef: Ref<HTMLDivElement>;
  name: string;
  host: string;
  freeUntil: string;
  launching: boolean;
  leaving: boolean;
  launchRef: Ref<HTMLButtonElement>;
  onBack: (() => void) | null;
  onLaunch: () => void;
}) {
  return (
    <>
      <StageQuestion
        ref={questionRef}
        eyebrow={stepLabel(3)}
        title="Ready to launch?"
        hidden={leaving}
      >
        The moment you press launch, <b className="text-(--text)">{host}</b>{" "}
        goes live for the world.
      </StageQuestion>
      <StageArt ref={artRef} />
      <StageDock hidden={leaving}>
        <div className="flex items-center gap-3 rounded-[14px] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3.5 py-3 text-left text-[13px] text-(--muted)">
          <AcademyInitials name={name} size={40} />
          <span className="min-w-0">
            <b className="block truncate text-[15px] text-(--text)">{name}</b>
            {host} · free until {freeUntil}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onBack ? (
            <Button
              variant="quiet"
              aria-label="Back"
              onClick={onBack}
              disabled={launching}
              className="h-16! w-14! rounded-[14px]! @max-[700px]:h-14.5!"
            >
              <ArrowLeft size={18} weight="bold" aria-hidden="true" />
            </Button>
          ) : null}
          <LaunchButton
            ref={launchRef}
            onClick={onLaunch}
            disabled={launching}
            aria-busy={launching}
            className="flex-1"
          >
            {launching ? (
              <CircleNotch
                size={22}
                weight="bold"
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <RocketLaunch size={22} weight="fill" aria-hidden="true" />
            )}
            <span className="truncate">Launch {name}</span>
          </LaunchButton>
        </div>
      </StageDock>
    </>
  );
}
