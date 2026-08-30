import type { ButtonHTMLAttributes, ReactNode } from "react";

import { classNames } from "../../utils/classNames";

export interface PlayerMenuItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "role"
> {
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  checked?: boolean;
}

export function PlayerMenuItem({
  className,
  checked,
  description,
  disabled,
  label,
  leading,
  selected,
  trailing,
  type = "button",
  ...props
}: PlayerMenuItemProps) {
  return (
    <button
      {...props}
      type={type}
      role={
        checked !== undefined
          ? "menuitemcheckbox"
          : selected === undefined
            ? "menuitem"
            : "menuitemradio"
      }
      tabIndex={-1}
      aria-checked={checked ?? (selected === undefined ? undefined : selected)}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={classNames(
        "group flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-(--text) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--text,#fff)_10%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--text,#fff)_10%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--text) disabled:cursor-not-allowed disabled:opacity-45",
        (selected || checked) &&
          "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]",
        className,
      )}
    >
      {leading ? (
        <span
          className="grid size-5 shrink-0 place-items-center text-(--text-secondary)"
          aria-hidden="true"
        >
          {leading}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs leading-4 text-(--text-secondary)">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-xs tabular-nums text-(--text-secondary)">
          {trailing}
        </span>
      ) : null}
      {trailing ? null : (
        <span
          className={classNames(
            "size-1.5 shrink-0 rounded-full bg-transparent",
            (selected || checked) && "bg-current text-(--text)",
          )}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
