/**
 * An on/off switch drawn like the ones in the coupon builder and the
 * settings pages: accent when on, a muted track when off.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Read by screen readers; the visible label sits next to the switch. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "bg-(--accent)"
          : "bg-[color-mix(in_srgb,var(--text)_22%,transparent)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
