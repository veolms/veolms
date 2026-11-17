import { useId } from "react";
import type { Icon } from "@phosphor-icons/react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyedropperIcon as Eyedropper } from "@phosphor-icons/react/Eyedropper";

/**
 * Small controls the email editor's style options are made from: a row of
 * choices (alignment, size, font) and a row of colours.
 */

export function SegmentedChoice<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  showLabel = false,
}: {
  label: string;
  value: Value;
  options: readonly {
    value: Value;
    label: string;
    icon?: Icon;
  }[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  /** Shows the label before the choices; otherwise it is for screen readers. */
  showLabel?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        id={labelId}
        className={
          showLabel
            ? "shrink-0 text-[12px] font-medium text-(--muted)"
            : "sr-only"
        }
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex min-w-0 items-center gap-0.5 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-0.5"
      >
        {options.map((option) => {
          const OptionIcon = option.icon;
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={OptionIcon ? option.label : undefined}
              title={option.label}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 rounded-lg border-none px-1.5 text-[12px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                selected
                  ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-compact-shadow)"
                  : "bg-transparent text-(--muted) hover:text-(--text)"
              }`}
            >
              {OptionIcon ? <OptionIcon size={15} /> : option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A row of colours to pick from, a "custom" well for any colour, and,
 * when `defaultLabel` is given, a first swatch that means "the theme's".
 */
export function ColorChoice({
  label,
  value,
  options,
  onChange,
  defaultColor,
  defaultLabel,
  disabled = false,
}: {
  label: string;
  /** Null: the default. */
  value: string | null;
  options: readonly string[];
  onChange: (value: string | null) => void;
  /** What the default looks like, for its swatch. */
  defaultColor?: string;
  defaultLabel?: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const custom = value !== null && !options.includes(value.toUpperCase());
  const swatch = (selected: boolean) =>
    `relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-40 ${
      selected
        ? "border-(--text)"
        : "border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
    }`;
  return (
    <div className="grid min-w-0 gap-1.5">
      <span id={labelId} className="text-[12px] font-medium text-(--muted)">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex flex-wrap items-center gap-1.5"
      >
        {defaultLabel ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            title={defaultLabel}
            aria-label={defaultLabel}
            disabled={disabled}
            onClick={() => onChange(null)}
            className={swatch(value === null)}
            style={{ backgroundColor: defaultColor }}
          >
            {value === null ? (
              <Check
                size={13}
                weight="bold"
                className="text-white mix-blend-difference"
              />
            ) : null}
          </button>
        ) : null}
        {options.map((color) => {
          const selected = value?.toUpperCase() === color.toUpperCase();
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color}
              title={color}
              disabled={disabled}
              onClick={() => onChange(color)}
              className={swatch(selected)}
              style={{ backgroundColor: color }}
            >
              {selected ? (
                <Check
                  size={13}
                  weight="bold"
                  className="text-white mix-blend-difference"
                />
              ) : null}
            </button>
          );
        })}
        <label
          className={`${swatch(custom)} overflow-hidden bg-[conic-gradient(#f43f5e,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#f43f5e)]`}
          title="Any colour"
          style={custom ? { background: value ?? undefined } : undefined}
        >
          <Eyedropper
            size={13}
            weight="bold"
            className="text-white drop-shadow"
          />
          <input
            type="color"
            value={value ?? defaultColor ?? "#6E7CFF"}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            aria-label={`${label}: any colour`}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
