import { CheckIcon as Check } from "@phosphor-icons/react/Check";

interface CircularCheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  ariaLabel?: string;
  labelPosition?: "before" | "after";
  className?: string;
  indicatorClassName?: string;
  unstyled?: boolean;
  disabled?: boolean;
}

export function CircularCheckbox({
  id,
  checked,
  onCheckedChange,
  label,
  ariaLabel,
  labelPosition = "after",
  className = "",
  indicatorClassName = "",
  unstyled = false,
  disabled = false,
}: CircularCheckboxProps) {
  const text = <span>{label}</span>;
  const indicatorClasses = indicatorClassName
    ? indicatorClassName
    : "inline-flex size-4 shrink-0 items-center justify-center rounded-full border [border-color:color-mix(in_srgb,var(--text)_28%,transparent)] bg-(--canvas) text-transparent transition-[background-color,border-color,color] peer-checked:border-(--accent) peer-checked:bg-(--accent) peer-checked:text-(--on-accent) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent) group-hover:[border-color:color-mix(in_srgb,var(--accent)_58%,var(--text-secondary))]";

  return (
    <label
      htmlFor={id}
      data-circular-checkbox
      className={
        unstyled
          ? `${className} ${disabled ? "pointer-events-none opacity-60" : ""}`
          : `group inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--hover) sm:text-sm ${className} ${disabled ? "pointer-events-none opacity-60" : ""}`
      }
    >
      {labelPosition === "before" && text}
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        aria-label={ariaLabel ?? label}
        className="peer sr-only"
      />
      <span className={indicatorClasses} aria-hidden="true">
        <Check size={10} weight="bold" />
      </span>
      {labelPosition === "after" && text}
    </label>
  );
}
