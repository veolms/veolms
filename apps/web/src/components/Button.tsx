import type { ButtonHTMLAttributes, Ref } from "react";

type ButtonMotion = "lift" | "static";

/**
 * `primary` is the accent action; `quiet` the one beside it (Cancel, Close),
 * as the confirm dialogs draw it; `danger` a destructive action that is not
 * the main one.
 */
type ButtonVariant = "primary" | "quiet" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  motion?: ButtonMotion;
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}

const motionClasses: Record<ButtonMotion, string> = {
  lift: "transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0",
  static: "transition-[background-color,box-shadow]",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-(--accent) text-(--on-accent) shadow-[0_7px_18px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] hover:bg-(--accent-hover) hover:shadow-[0_9px_22px_color-mix(in_srgb,var(--accent-shadow)_58%,transparent)]",
  quiet:
    "bg-(--surface-strong) text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)",
  danger: "bg-rose-500/12 text-rose-500 hover:bg-rose-500/20",
};

export function Button({
  className = "",
  motion = "lift",
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      data-control-radius-action
      data-button-motion={motion}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-55 ${variantClasses[variant]} ${motionClasses[motion]} ${className}`}
    />
  );
}
