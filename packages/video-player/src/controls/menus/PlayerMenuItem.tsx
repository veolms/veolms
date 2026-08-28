import type { ButtonHTMLAttributes, ReactNode } from "react";

import { classNames } from "../../utils/classNames";

export interface PlayerMenuItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "role"> {
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
}

export function PlayerMenuItem({
  className,
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
      role={selected === undefined ? "menuitem" : "menuitemradio"}
      tabIndex={-1}
      aria-checked={selected === undefined ? undefined : selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={classNames(
        "group flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-white transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45",
        selected && "bg-white/12",
        className,
      )}
    >
      {leading ? (
        <span className="grid size-5 shrink-0 place-items-center text-white/72" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs leading-4 text-white/62">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-xs tabular-nums text-white/64">
          {trailing}
        </span>
      ) : null}
      <span
        className={classNames(
          "size-1.5 shrink-0 rounded-full bg-transparent",
          selected && "bg-current text-white",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
