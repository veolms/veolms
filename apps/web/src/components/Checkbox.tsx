import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import type { ReactNode } from "react";

export interface CheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  id,
  checked,
  onCheckedChange,
  label,
  ariaLabel,
  disabled = false,
  className = "",
}: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      data-checkbox
      className={`group inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-(--text-secondary) transition-colors sm:text-sm ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-(--hover)"} ${className}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        className="peer sr-only"
      />
      <span
        data-checkbox-indicator
        aria-hidden="true"
        className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-[4px] border [border-color:color-mix(in_srgb,var(--text)_30%,transparent)] bg-(--canvas) text-transparent transition-[background-color,border-color,color] peer-checked:border-(--accent) peer-checked:bg-(--accent) peer-checked:text-(--on-accent) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent) group-hover:[border-color:color-mix(in_srgb,var(--accent)_62%,var(--text-secondary))]"
      >
        <Check size={11} weight="bold" />
      </span>
      <span>{label}</span>
    </label>
  );
}
