import type { ReactNode } from "react";

// The same surface and field treatment the other admin pages (coupons,
// orders) use, so this page reads as part of the same workspace.
export const surfaceClass =
  "rounded-[14px] sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-shadow,var(--surface-depth-shadow))";

export const fieldClass =
  "w-full min-w-0 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-3.5 text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

export const insetRowClass =
  "rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_55%,var(--surface))]";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
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

/**
 * One block of the home page: what it is, whether it is shown (when it can
 * be hidden), and its fields. A hidden block keeps its fields editable but
 * dimmed, so it can be prepared before it is switched back on.
 */
export function SettingsSection({
  id,
  title,
  description,
  visible,
  onVisibleChange,
  children,
}: {
  id: string;
  title: string;
  description: string;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  children: ReactNode;
}) {
  const hidden = visible === false;
  return (
    <section aria-labelledby={id} className={`${surfaceClass} p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold text-(--text)">
            {title}
          </h2>
          <p className="mt-1 text-sm text-(--muted)">{description}</p>
        </div>
        {onVisibleChange ? (
          <label className="flex shrink-0 items-center gap-2.5 text-sm font-medium text-(--text-secondary,var(--text))">
            <span>{hidden ? "Hidden" : "Shown"}</span>
            <Switch
              checked={!hidden}
              onChange={onVisibleChange}
              label={`Show ${title} on the home page`}
            />
          </label>
        ) : null}
      </div>
      <div
        className={`mt-5 grid gap-4 transition-opacity ${hidden ? "opacity-55" : ""}`}
      >
        {children}
      </div>
    </section>
  );
}

/** A labelled single-line or multi-line text field with a length counter. */
export function TextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  required = false,
  multiline = false,
  hint,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  const missing = required && value.trim().length === 0;
  const describedBy = hint || missing ? `${id}-hint` : undefined;
  const shared = {
    id,
    value,
    maxLength,
    placeholder,
    "aria-invalid": missing || undefined,
    "aria-describedby": describedBy,
  };

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-(--text)">
          {label}
          {required ? <span className="text-(--accent)"> *</span> : null}
        </label>
        <span className="text-xs text-(--muted) tabular-nums">
          {value.length}/{maxLength}
        </span>
      </div>
      {multiline ? (
        <textarea
          {...shared}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} resize-y py-2.5 leading-relaxed`}
        />
      ) : (
        <input
          {...shared}
          type="text"
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} h-11`}
        />
      )}
      {describedBy ? (
        <p
          id={describedBy}
          className={`mt-1.5 text-xs ${missing ? "text-rose-500" : "text-(--muted)"}`}
        >
          {missing ? `${label} is required.` : hint}
        </p>
      ) : null}
    </div>
  );
}
