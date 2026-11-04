import type { ButtonHTMLAttributes, Ref } from "react";

type ButtonMotion = "lift" | "static";

/**
 * `primary` is the accent action; `quiet` the one beside it (Cancel, Close),
 * as the confirm dialogs draw it; `danger` a destructive action that is not
 * the main one.
 */
type ButtonVariant = "primary" | "quiet" | "danger";

/**
 * `raised` gives the primary action its glow; `flat` drops it, for a
 * screen whose actions sit flush with the page (the Team page), as the
 * Analytics toolbar's do.
 */
type ButtonElevation = "raised" | "flat";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  motion?: ButtonMotion;
  variant?: ButtonVariant;
  elevation?: ButtonElevation;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A button never moves under the pointer: hovering only shades its
 * background (each variant's `hover:bg-…`). `lift` raised it by 2px and
 * is kept as a name so callers need not change; it now means the same as
 * `static`.
 */
const motionClasses: Record<ButtonMotion, string> = {
  lift: "transition-[background-color,color,box-shadow]",
  static: "transition-[background-color,color,box-shadow]",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover)",
  quiet:
    "bg-(--surface-strong) text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)",
  danger: "bg-rose-500/12 text-rose-500 hover:bg-rose-500/20",
};

/** The primary action's glow; the other variants have none. */
const raisedPrimaryClasses =
  "shadow-[0_7px_18px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] hover:shadow-[0_9px_22px_color-mix(in_srgb,var(--accent-shadow)_58%,transparent)]";

export function Button({
  className = "",
  motion = "lift",
  variant = "primary",
  elevation = "raised",
  type = "button",
  ...props
}: ButtonProps) {
  const glow =
    variant === "primary" && elevation === "raised" ? raisedPrimaryClasses : "";
  return (
    <button
      {...props}
      type={type}
      data-control-radius-action
      data-button-motion={motion}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-55 ${variantClasses[variant]} ${glow} ${motionClasses[motion]} ${className}`}
    />
  );
}
