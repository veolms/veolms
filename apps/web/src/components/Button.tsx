import type { ButtonHTMLAttributes } from "react";

type ButtonMotion = "lift" | "static";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  motion?: ButtonMotion;
}

const motionClasses: Record<ButtonMotion, string> = {
  lift: "transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 active:translate-y-0",
  static: "transition-[background-color,box-shadow]",
};

export function Button({
  className = "",
  motion = "lift",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      data-control-radius-action
      data-button-motion={motion}
      className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) shadow-[0_7px_18px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] hover:bg-(--accent-hover) hover:shadow-[0_9px_22px_color-mix(in_srgb,var(--accent-shadow)_58%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-55 ${motionClasses[motion]} ${className}`}
    />
  );
}
