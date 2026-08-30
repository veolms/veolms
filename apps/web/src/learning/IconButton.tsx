import React from "react";
import type { MouseEventHandler, ReactNode } from "react";

interface IconButtonProps {
  label: string;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  pressed?: boolean;
  ariaControls?: string;
}

export function IconButton({
  label,
  children,
  className = "",
  onClick,
  pressed,
  ariaControls,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-controls={ariaControls}
      onClick={onClick}
      data-learning-radius-compact
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${className}`}
    >
      {children}
    </button>
  );
}
