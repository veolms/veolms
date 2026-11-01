import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { Icon } from "@phosphor-icons/react";
import type { TeamMemberRole } from "@veolms/contracts";
import { useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { ElevatedCard } from "../components/ElevatedCard";
import { filterControlClasses } from "../components/FilterBar";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { initials, roleLabel } from "./teamFormat";

/** Small shared pieces of the Team page, drawn from the shared components. */

/** A list's header row, as the Students table draws it. */
export const tableHeaderClassName =
  "border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold tracking-wider text-(--muted) uppercase select-none";

/** The line between two rows of a list. */
export const rowDividerClassName =
  "border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] last:border-b-0";

/** A small chip: a role, a count, a "Built-in" tag. */
export const chipClassName =
  "inline-flex items-center gap-1 rounded-md border border-(--border) bg-(--card-surface) px-2 py-0.5 text-xs font-semibold text-(--text)";

export function RoleChips({
  roles,
  empty = "No team role",
}: {
  roles: readonly Pick<TeamMemberRole, "id" | "name">[];
  empty?: string;
}) {
  if (roles.length === 0) {
    return <span className="text-xs text-(--muted)">{empty}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span key={role.id} className={chipClassName}>
          {roleLabel(role.name)}
        </span>
      ))}
    </span>
  );
}

export function StatusChip({
  tone,
  children,
}: {
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const tones = {
    neutral: "border-(--border) bg-(--hover) text-(--muted)",
    accent: "border-(--accent)/20 bg-(--accent)/10 text-(--accent)",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-500",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-500",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.75 text-[11px] font-semibold whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A steady tint per person, so the same initials keep the same colour. */
const AVATAR_TONES = [
  "bg-amber-400/15 text-amber-300 [[data-theme=light]_&]:text-amber-700",
  "bg-emerald-400/15 text-emerald-300 [[data-theme=light]_&]:text-emerald-700",
  "bg-sky-400/15 text-sky-300 [[data-theme=light]_&]:text-sky-700",
  "bg-violet-400/15 text-violet-300 [[data-theme=light]_&]:text-violet-700",
  "bg-rose-400/15 text-rose-300 [[data-theme=light]_&]:text-rose-700",
] as const;

function avatarTone(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export function PersonAvatar({
  name,
  email,
  avatarUrl,
}: {
  name: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  return avatarUrl ? (
    <ResponsiveAvatar
      src={avatarUrl}
      alt=""
      sizes="40px"
      width={40}
      height={40}
      className="size-10 shrink-0 rounded-full border border-(--border) object-cover shadow-xs"
    />
  ) : (
    <span
      aria-hidden="true"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full border border-(--border) text-xs font-bold shadow-xs ${avatarTone(email)}`}
    >
      {initials(name, email)}
    </span>
  );
}

export interface RowMenuItem {
  label: string;
  icon: Icon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draw a line above this item, setting it apart (a destructive one). */
  separated?: boolean;
}

/** The "⋮" menu at the end of a row. */
export function RowMenu({
  label,
  items,
  title,
}: {
  label: string;
  items: readonly RowMenuItem[];
  /** A small heading above the items, such as whose row this is. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        title="Actions"
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-transparent text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) data-popup-open:border-(--border) data-popup-open:bg-(--hover) data-popup-open:text-(--text)"
      >
        <DotsThreeVertical size={18} weight="bold" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-60 p-1.5">
        {title ? (
          <p className="truncate px-2.5 pt-1.5 pb-1 text-[11px] font-bold tracking-wider text-(--muted) uppercase">
            {title}
          </p>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0" role="menu">
          {items.map((item) => (
            <li
              key={item.label}
              role="none"
              className={
                item.separated
                  ? "mt-1 border-t border-(--border) pt-1"
                  : undefined
              }
            >
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-(--hover) disabled:cursor-default disabled:opacity-50 ${item.danger ? "text-rose-500" : "text-(--text)"}`}
              >
                <item.icon size={16} weight="bold" aria-hidden="true" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** The search control of a filter row (see `FilterBar`). */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`${filterControlClasses} min-w-0 flex-1 cursor-text gap-2.5 ${className}`}
    >
      <span className="sr-only">{label}</span>
      <MagnifyingGlass
        size={17}
        aria-hidden="true"
        className="shrink-0 text-(--muted)"
      />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border-0 bg-transparent p-0 text-xs text-(--text-secondary) placeholder-(--muted) outline-none md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="cursor-pointer text-(--muted) hover:text-(--text)"
        >
          <X size={14} />
        </button>
      ) : null}
    </label>
  );
}

/** A text field in a form, as the Students contact dialog draws one. */
export const inputClassName =
  "min-h-11 w-full min-w-0 rounded-xl border-0 bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 text-sm text-(--text) placeholder-(--muted) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] disabled:opacity-60";

/** A quiet button for a class list (a "Show more" under a list). */
export const secondaryButtonClassName =
  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--surface-strong) px-4 text-sm font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:pointer-events-none disabled:opacity-55";

/** Empty, as the Students page shows it: a card with an icon and a line. */
export function EmptyState({
  icon: IconComponent,
  title,
  children,
}: {
  icon: Icon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <ElevatedCard
      as="div"
      className="flex flex-col items-center justify-center p-12 text-center"
    >
      <span className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-(--hover) text-(--muted)">
        <IconComponent size={28} weight="duotone" />
      </span>
      <h3 className="text-base font-semibold text-(--text)">{title}</h3>
      {children ? (
        <div className="mt-1 max-w-sm text-xs leading-relaxed text-(--muted) md:text-sm">
          {children}
        </div>
      ) : null}
    </ElevatedCard>
  );
}

/** Could not load: the same card, with Retry. */
export function LoadError({
  icon,
  title,
  message,
  onRetry,
}: {
  icon: Icon;
  title: string;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState icon={icon} title={title}>
      <p>{message || "Try again in a moment."}</p>
      <Button className="mt-4" onClick={onRetry}>
        Retry
      </Button>
    </EmptyState>
  );
}

/** Rows that stand in for a list while it loads. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ElevatedCard as="div" className="overflow-hidden" aria-busy="true">
      <div className={`h-10 ${tableHeaderClassName}`} />
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={`flex items-center gap-3 px-5 py-3.5 ${rowDividerClassName}`}
        >
          <span className="size-10 shrink-0 animate-pulse rounded-full bg-(--hover)" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-3 w-40 animate-pulse rounded bg-(--hover)" />
            <span className="h-2.5 w-56 animate-pulse rounded bg-(--hover)" />
          </span>
        </div>
      ))}
    </ElevatedCard>
  );
}

/** A slide-over's scrolling body and its sticky footer. */
export function PanelBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
  );
}

export function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-(--border) p-4 sm:px-6">
      {children}
    </div>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-(--text)"
      >
        {children}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-(--muted)">{hint}</p> : null}
    </div>
  );
}
