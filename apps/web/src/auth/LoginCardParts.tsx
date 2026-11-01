import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { AUTH_CARD_HEADING_ID } from "./authFlow";

/**
 * The pieces the login card's steps are built from (the welcome step and the
 * code step), in the card's own look: the theme's surface, its text and
 * accent, 10px corners on fields and buttons.
 *
 * Font sizes and weights on buttons and fields are marked important: the
 * app's base stylesheet sets `font: inherit` on every button and input
 * outside any layer, which outranks utilities.
 */

/** The card's frame, in the pop-up and on the login page alike. */
export const loginCardFrameClasses =
  "max-w-105! sm:max-w-115! rounded-[20px]! border-[color-mix(in_srgb,var(--text)_8%,transparent)]! px-[clamp(20px,6vw,36px)]! pt-9! pb-7!";

/** The step's column inside the frame: not positioned, so a step's back
 * button is placed against the frame, as the close button is. */
export const loginCardColumnClasses = "static!";

/** A corner button: the pop-up's close, the code step's back. */
export const loginCardCornerButtonClasses =
  "absolute top-3.5 z-10 inline-flex size-10 items-center justify-center rounded-[10px] text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-50";

const quietTextClasses =
  "text-[color-mix(in_srgb,var(--muted)_78%,var(--surface))]";

export const loginLinkClasses =
  "font-semibold! text-[0.84375rem]! text-(--accent-ink,var(--accent)) hover:text-[color-mix(in_srgb,var(--accent-ink,var(--accent))_75%,var(--text))] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-50";

export function LoginHeading({
  title,
  subtitle,
  centered = false,
}: {
  title: string;
  subtitle: ReactNode;
  centered?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", centered && "text-center")}>
      <h1
        className="m-0 text-2xl leading-7.5 font-bold tracking-[-0.3px] text-(--text)"
        id={AUTH_CARD_HEADING_ID}
      >
        {title}
      </h1>
      <p className="m-0 text-[0.9375rem] leading-5.5 text-(--muted)">
        {subtitle}
      </p>
    </div>
  );
}

export function LoginDivider() {
  return (
    <div className="flex items-center gap-3.5" role="separator">
      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
      <span
        className={cn("text-xs font-medium tracking-[0.4px]", quietTextClasses)}
      >
        or
      </span>
      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
    </div>
  );
}

/** A small line of help under a form. */
export function LoginFootnote({ children }: { children: ReactNode }) {
  return (
    <p
      className={cn(
        "m-0 text-center text-[0.78125rem] leading-4.5",
        quietTextClasses,
      )}
    >
      {children}
    </p>
  );
}

// A whole-pixel line, for the reason given at the brand in LoginView.
export const loginLabelClasses =
  "text-[0.8125rem] leading-5 font-semibold text-(--text-secondary)";

/** A field's box; the input inside it fills it. */
export const loginFieldBoxClasses =
  "flex h-11.5 min-w-0 items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_45%,var(--surface))] px-3.5 text-(--text) transition-[border-color,box-shadow] focus-within:border-(--accent) focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)] has-[[aria-invalid=true]]:border-(--danger)";

export const loginInputClasses =
  "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[0.9375rem]! text-(--text) outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_78%,var(--surface))] disabled:opacity-60 [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_color-mix(in_srgb,var(--canvas)_45%,var(--surface))] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--text)]";

/**
 * A field's label with, at its right, what is wrong with the field. The
 * message is held to the bottom of the label's line and is taken out of
 * the flow, so it never moves the field or anything under it: one line sits
 * beside the label, and a second (a longer message from the server) rises
 * into the space above it. Two lines at most; the whole of it on hover.
 */
export function LoginFieldLabel({
  htmlFor,
  label,
  error,
  errorId,
}: {
  htmlFor: string;
  label: string;
  error: string | null;
  errorId: string;
}) {
  return (
    <div className="relative flex min-h-5 items-end">
      <label className={loginLabelClasses} htmlFor={htmlFor}>
        {label}
      </label>
      {error ? (
        <p
          className="absolute right-0 bottom-0 m-0 line-clamp-2 max-w-[calc(100%_-_5.5rem)] text-right text-xs leading-4 font-medium text-(--danger)"
          id={errorId}
          role="alert"
          title={error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LoginFieldError({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p
      className="m-0 text-[0.8125rem] leading-5 text-(--danger)"
      id={id}
      role="alert"
    >
      {children}
    </p>
  );
}

/** The card's full-width buttons: the accent's fill, or the quieter surface. */
export const loginButtonClasses = {
  base: "inline-flex h-11.5 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[0.9375rem]! font-semibold! transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-progress",
  primary:
    "border-0 bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) disabled:opacity-70",
  secondary:
    "border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_5%,var(--surface))] text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_9%,var(--surface))] disabled:opacity-70",
};

/**
 * The step's main button: the accent's fill, or, where another way in
 * leads (the remembered Google account), the quieter surface one. While it
 * is busy it says so and shows a spinner in place of the arrow; screen
 * readers are told through `pendingMessage`.
 */
export function LoginSubmitButton({
  label,
  busy,
  busyLabel,
  pendingMessage,
  disabled = false,
  tone = "primary",
  className,
}: {
  label: string;
  busy: boolean;
  busyLabel: string;
  pendingMessage?: string;
  disabled?: boolean;
  tone?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <>
      <span className="sr-only" role="status">
        {busy ? (pendingMessage ?? "") : ""}
      </span>
      <button
        aria-busy={busy}
        className={cn(
          loginButtonClasses.base,
          loginButtonClasses[tone],
          className,
        )}
        disabled={busy || disabled}
        type="submit"
      >
        <span>{busy ? busyLabel : label}</span>
        {busy ? (
          <CircleNotch
            aria-hidden
            className="animate-spin motion-reduce:animate-none"
            size={16}
            weight="bold"
          />
        ) : (
          <ArrowRight aria-hidden size={16} weight="bold" />
        )}
      </button>
    </>
  );
}
