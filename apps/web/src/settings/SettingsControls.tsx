import { useRef } from "react";
import type {
  ComponentType,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { Check } from "@phosphor-icons/react";
import { ThemedSelect } from "../ThemedSelect";
import type { ThemedSelectOption } from "../ThemedSelect";

type SettingsIcon = ComponentType<{
  size?: number;
  weight?: "bold" | "duotone" | "fill" | "regular";
}>;

export interface ChoiceCardProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  note?: string;
  icon?: SettingsIcon;
  preview?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ChoiceCard({
  checked,
  onChange,
  label,
  note,
  icon: Icon,
  preview,
  children,
  className = "",
}: ChoiceCardProps) {
  return (
    <button
      type="button"
      className={`settings-choice-card ${checked ? "is-selected" : ""} ${className}`}
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      onClick={onChange}
    >
      {preview}
      <span className="settings-choice-card__copy">
        <span className="settings-choice-card__label">
          <span className="settings-radio" aria-hidden="true">
            {checked && <Check size={11} weight="bold" />}
          </span>
          {Icon && <Icon size={19} weight="duotone" />}
          <strong>{label}</strong>
        </span>
        {note && <small>{note}</small>}
        {children}
      </span>
    </button>
  );
}

export interface RadioGroupProps {
  children: ReactNode;
  label: string;
  className?: string;
}

export function RadioGroup({
  children,
  label,
  className = "",
}: RadioGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    const options = [
      ...(groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ??
        []),
    ];
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    const currentIndex = options.indexOf(activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next =
      options[(currentIndex + direction + options.length) % options.length];
    next?.focus();
    next?.click();
  };

  return (
    <div
      ref={groupRef}
      className={className}
      role="radiogroup"
      aria-label={label}
      onKeyDown={moveFocus}
    >
      {children}
    </div>
  );
}

export interface SettingsToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function SettingsToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: SettingsToggleProps) {
  return (
    <button
      type="button"
      className={`settings-toggle ${checked ? "is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

const INTERACTIVE_ROW_TARGETS =
  "button, a, input, select, textarea, [role='button'], [role='link'], [role='radio'], [role='slider'], [contenteditable='true']";

export function clickContainedSettingsToggle(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element) || target.closest(INTERACTIVE_ROW_TARGETS)) {
    return;
  }

  event.currentTarget
    .querySelector<HTMLButtonElement>(".settings-toggle:not(:disabled)")
    ?.click();
}

export interface SettingRowProps extends HTMLAttributes<HTMLDivElement> {
  icon: SettingsIcon;
  label: string;
  note: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingRow({
  icon: Icon,
  label,
  note,
  children,
  className = "",
  onClick,
  ...rowProps
}: SettingRowProps) {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) clickContainedSettingsToggle(event);
  };

  return (
    <div
      {...rowProps}
      className={`settings-row ${className}`}
      onClick={handleClick}
    >
      <span className="settings-row__icon" aria-hidden="true">
        <Icon size={20} weight="duotone" />
      </span>
      <span className="settings-row__copy">
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
      <span className="settings-row__control">{children}</span>
    </div>
  );
}

export interface LearningSelectRowProps {
  id: string;
  label: string;
  note: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ThemedSelectOption[];
  disabled?: boolean;
}

export function LearningSelectRow({
  id,
  label,
  note,
  value,
  onChange,
  options,
  disabled = false,
}: LearningSelectRowProps) {
  return (
    <div className="settings-learning-select-row">
      <span className="settings-learning-select-row__copy">
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
      <ThemedSelect
        id={id}
        value={value}
        onValueChange={onChange}
        options={options}
        disabled={disabled}
        ariaLabel={label}
      />
    </div>
  );
}

export interface LearningToggleRowProps {
  label: string;
  note: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function LearningToggleRow({
  label,
  note,
  checked,
  onChange,
  disabled = false,
}: LearningToggleRowProps) {
  return (
    <div
      className="settings-learning-toggle-row"
      onClick={clickContainedSettingsToggle}
    >
      <span className="settings-learning-toggle-row__copy">
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
      <SettingsToggle
        checked={checked}
        onChange={onChange}
        label={label}
        disabled={disabled}
      />
    </div>
  );
}
