import type { ReactNode } from "react";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";

import { ElevatedCard } from "../../components/ElevatedCard";
import { filterSelectTriggerClasses } from "../../components/FilterBar";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../../searchShortcut";
import { ThemedSelect, type ThemedSelectOption } from "../../ThemedSelect";

export interface AdminTile {
  id: string;
  title: string;
  value: string;
  note: string;
  /** Picks this tile's filter (a tile that is a filter). */
  onSelect?: () => void;
  active?: boolean;
}

/**
 * Figures over a list, as the Orders page's: one row when there is room,
 * two columns on a phone. A tile can also be a shortcut to its filter.
 */
export function AdminSummaryTiles({
  label,
  tiles,
  count,
  isLoading,
}: {
  label: string;
  tiles: readonly AdminTile[] | null;
  /** How many tiles there will be, for the placeholders. */
  count: number;
  isLoading: boolean;
}) {
  const shown =
    !tiles || isLoading
      ? Array.from({ length: count }, (_, index) => ({
          id: `loading-${index}`,
          title: "",
          value: "",
          note: "",
        }))
      : tiles;
  const columns =
    count === 8
      ? "@2xl:grid-cols-4"
      : count >= 6
        ? "@2xl:grid-cols-3 @5xl:grid-cols-6"
        : count === 5
          ? "@2xl:grid-cols-5"
          : count === 4
            ? "@xl:grid-cols-4"
            : "@xl:grid-cols-3";
  return (
    <div className="@container">
      <section
        aria-label={label}
        aria-busy={isLoading || undefined}
        className={`grid grid-cols-2 gap-2.5 @2xl:gap-3 ${columns}`}
      >
        {shown.map((tile, index) => {
          const odd = count % 2 === 1 && index === count - 1;
          const body = tile.title ? (
            <>
              <p className="m-0 truncate text-xs font-semibold text-(--muted)">
                {tile.title}
              </p>
              <p
                className="m-0 mt-1.5 truncate text-xl font-bold tracking-tight text-(--text) tabular-nums @2xl:text-lg @5xl:text-2xl"
                title={tile.value}
              >
                {tile.value}
              </p>
              <p className="m-0 mt-1 truncate text-xs text-(--muted)">
                {tile.note}
              </p>
            </>
          ) : (
            <div aria-hidden="true">
              <div className="h-3 w-20 animate-pulse rounded bg-(--border)" />
              <div className="mt-2.5 h-6 w-24 animate-pulse rounded bg-(--border)" />
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-(--border)" />
            </div>
          );
          const select = "onSelect" in tile ? tile.onSelect : undefined;
          const active = "active" in tile && tile.active;
          return (
            <ElevatedCard
              as="article"
              key={tile.id}
              className={`min-w-0 p-0 ${odd ? "col-span-2 @xl:col-span-1" : ""} ${
                active ? "shadow-[inset_0_0_0_1.5px_var(--accent)]" : ""
              }`}
            >
              {select ? (
                <button
                  type="button"
                  aria-pressed={Boolean(active)}
                  onClick={select}
                  className="block w-full rounded-[inherit] px-4 py-3.5 text-left transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent) @2xl:px-3.5 @2xl:py-3 @5xl:px-5 @5xl:py-4"
                >
                  {body}
                </button>
              ) : (
                <div className="px-4 py-3.5 @2xl:px-3.5 @2xl:py-3 @5xl:px-5 @5xl:py-4">
                  {body}
                </div>
              )}
            </ElevatedCard>
          );
        })}
      </section>
    </div>
  );
}

/** The Orders page's search box: the row's remaining width, "/" to focus. */
export function AdminSearchBox({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex h-11 w-full min-w-0 shrink-0 cursor-text @4xl:w-auto @4xl:flex-1 items-center gap-2.5 rounded-xl border border-(--border) bg-(--card-surface) px-3.5 focus-within:border-(--accent) focus-within:ring-2 focus-within:ring-(--accent)/20">
      <MagnifyingGlass
        size={17}
        className="shrink-0 text-(--muted)"
        aria-hidden="true"
      />
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
        data-search-shortcut-target
        maxLength={100}
        className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-(--text) outline-none placeholder:text-(--muted)"
      />
      <SearchShortcutHint />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="grid size-7 shrink-0 place-items-center rounded-md text-(--muted) hover:bg-(--hover) hover:text-(--text)"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

/** A one-choice filter (Sort, Show) drawn like the multi-select buttons. */
export function AdminSelectFilter<Value extends string>({
  id,
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  id: string;
  label: string;
  value: Value;
  options: readonly ThemedSelectOption<Value>[];
  onChange: (value: Value) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex h-11 min-w-0 items-center rounded-xl border border-(--border) bg-(--card-surface) px-3.5 transition-colors hover:bg-(--hover) ${className}`}
    >
      <ThemedSelect
        id={id}
        ariaLabel={label}
        value={value}
        options={options}
        onValueChange={onChange}
        matchMenuToContainer
        triggerClassName={`${filterSelectTriggerClasses} w-full font-semibold! text-(--text)!`}
      />
    </div>
  );
}

/**
 * The filters over a list, laid out as the Orders page's: the buttons in a
 * row (sharing it on a phone), the search taking the rest.
 */
export function AdminFilterRow({
  filters,
  search,
}: {
  filters: ReactNode;
  search: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="flex flex-col gap-2.5 @4xl:flex-row @4xl:items-center">
        <div className="grid grid-cols-2 gap-2 @lg:flex @lg:flex-wrap @4xl:shrink-0 @4xl:flex-nowrap">
          {filters}
        </div>
        {search}
      </div>
    </div>
  );
}

/** Each filter button's width in the row. */
export const adminFilterWidth = "w-full @lg:w-auto @lg:max-w-[15rem]";

/** The page's heading row inside a tab: what it is, and its controls. */
export function AdminTabHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="@container">
      <header className="flex flex-col gap-3 @2xl:flex-row @2xl:items-end @2xl:justify-between">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-bold tracking-tight text-(--text)">
            {title}
          </h2>
          <p className="m-0 mt-0.5 text-sm text-(--muted)">{description}</p>
        </div>
        {children ? (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        ) : null}
      </header>
    </div>
  );
}

/** Rows of a detail box: label on the left, value on the right. */
export function DetailRow({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt
        className={`shrink-0 text-sm ${strong ? "font-bold text-(--text)" : "text-(--muted)"}`}
      >
        {label}
      </dt>
      <dd
        className={`m-0 min-w-0 truncate text-right text-sm ${strong ? "font-bold" : "font-medium"} text-(--text)`}
      >
        {children}
      </dd>
    </div>
  );
}

export const detailBox =
  "rounded-2xl border border-(--border) bg-(--card-surface) p-4";
export const detailBoxTitle =
  "m-0 mb-2.5 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase";

/** A titled box in a side panel, as the order panel's. */
export function DetailBox({
  title,
  children,
  tone = "plain",
}: {
  title?: string;
  children: ReactNode;
  tone?: "plain" | "accent" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--card-surface))] p-4"
      : tone === "warning"
        ? "rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4"
        : detailBox;
  return (
    <section className={toneClass}>
      {title ? <h3 className={detailBoxTitle}>{title}</h3> : null}
      {children}
    </section>
  );
}

/** A footer button in a side panel. */
export const panelPrimaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-(--accent) px-4 text-sm font-bold text-(--on-accent) hover:opacity-90 disabled:opacity-40";
export const panelSecondaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-(--border) px-4 text-sm font-bold text-(--text) hover:bg-(--hover) disabled:opacity-40";
export const panelDangerButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/8 px-4 text-sm font-bold text-rose-600 hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-400";
