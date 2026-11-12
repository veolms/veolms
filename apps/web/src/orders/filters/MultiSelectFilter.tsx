import { useId, useMemo, useState, type ReactNode } from "react";
import type { OrderFilterMode } from "@veolms/contracts";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { CheckboxIndicator } from "../../components/Checkbox";
import { FilterDropdown } from "./FilterDropdown";

export interface MultiSelectOption {
  id: string;
  label: string;
  /** Drawn before the label (a course's picture, a status dot). */
  leading?: ReactNode;
}

export interface MultiSelectGroup {
  id: string;
  title?: string;
  options: readonly MultiSelectOption[];
}

export interface MultiSelectValue {
  selected: readonly string[];
  mode: OrderFilterMode;
}

export interface MultiSelectFilterProps {
  /** Names the filter ("Course"), for assistive tech and the sheet. */
  name: string;
  /** What the button says ("All paid courses"). */
  buttonLabel: string;
  buttonLeading?: ReactNode;
  /** Plural noun for the helper text: "courses". */
  noun: string;
  groups: readonly MultiSelectGroup[];
  value: MultiSelectValue;
  /** What Reset goes back to. */
  defaultValue: MultiSelectValue;
  onChange: (value: MultiSelectValue) => void;
  /** Shows a "Find a …" box above the list. */
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyText?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

/**
 * A filter of several choices: tick any number of options to show only
 * orders matching one of them, or switch on Exclude to show every order
 * except those. Nothing ticked is no filter. The choice is applied when the
 * dropdown closes (Done, a click outside, Esc).
 */
export function MultiSelectFilter({
  name,
  buttonLabel,
  buttonLeading,
  noun,
  groups,
  value,
  defaultValue,
  onChange,
  searchPlaceholder,
  isLoading = false,
  emptyText = "Nothing to choose from yet.",
  triggerClassName = "",
  contentClassName = "w-[22rem]",
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MultiSelectValue>(value);
  const [query, setQuery] = useState("");
  const switchId = useId();

  const openChange = (next: boolean) => {
    if (next) {
      setDraft(value);
      setQuery("");
    } else if (
      draft.mode !== value.mode ||
      draft.selected.join() !== value.selected.join()
    ) {
      onChange(draft);
    }
    setOpen(next);
  };

  const term = query.trim().toLowerCase();
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          options: term
            ? group.options.filter((option) =>
                option.label.toLowerCase().includes(term),
              )
            : group.options,
        }))
        .filter((group) => group.options.length > 0),
    [groups, term],
  );
  const total = groups.reduce((sum, group) => sum + group.options.length, 0);
  const selected = new Set(draft.selected);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft({ ...draft, selected: orderedIds(groups, next) });
  };

  const setGroup = (group: MultiSelectGroup, on: boolean) => {
    const next = new Set(selected);
    for (const option of group.options) {
      if (on) next.add(option.id);
      else next.delete(option.id);
    }
    setDraft({ ...draft, selected: orderedIds(groups, next) });
  };

  const excluding = draft.mode === "exclude";

  return (
    <FilterDropdown
      open={open}
      onOpenChange={openChange}
      label={`${name} filter: ${buttonLabel}`}
      trigger={
        <>
          {buttonLeading}
          <span className="truncate">{buttonLabel}</span>
        </>
      }
      triggerClassName={triggerClassName}
      contentClassName={contentClassName}
    >
      <div className="flex items-center justify-between gap-3 border-b border-(--border) px-4 py-3">
        <label htmlFor={switchId} className="text-xs text-(--muted)">
          {excluding
            ? `Showing all except selected ${noun}`
            : `Showing only selected ${noun}`}
        </label>
        <span className="flex items-center gap-2">
          <span
            className="text-xs font-semibold text-(--text)"
            aria-hidden="true"
          >
            Exclude
          </span>
          <button
            id={switchId}
            type="button"
            role="switch"
            aria-checked={excluding}
            aria-label="Exclude selected"
            onClick={() =>
              setDraft({ ...draft, mode: excluding ? "include" : "exclude" })
            }
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${excluding ? "bg-(--accent)" : "bg-[color-mix(in_srgb,var(--text)_22%,transparent)]"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${excluding ? "translate-x-4" : ""}`}
            />
          </button>
        </span>
      </div>

      {searchPlaceholder && (
        <div className="border-b border-(--border) px-3 py-2.5">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-(--border) bg-(--canvas) px-3 focus-within:border-(--accent)">
            <MagnifyingGlass
              size={15}
              className="shrink-0 text-(--muted)"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-(--text) outline-none placeholder:text-(--muted)"
            />
          </label>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-h-[min(22rem,var(--available-height,22rem))]">
        {isLoading ? (
          <div
            className="space-y-2 p-4"
            aria-busy="true"
            aria-label={`Loading ${noun}`}
          >
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-9 animate-pulse rounded-lg bg-(--border)"
              />
            ))}
          </div>
        ) : visibleGroups.length === 0 ? (
          <p className="m-0 px-4 py-6 text-center text-sm text-(--muted)">
            {total === 0 ? emptyText : `No ${noun} match “${query.trim()}”.`}
          </p>
        ) : (
          visibleGroups.map((group) => {
            const allOn = group.options.every((option) =>
              selected.has(option.id),
            );
            return (
              <fieldset key={group.id} className="m-0 border-0 p-0">
                {group.title && (
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <legend className="text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase">
                      {group.title}
                    </legend>
                    <button
                      type="button"
                      onClick={() => setGroup(group, !allOn)}
                      className="rounded px-1 text-xs font-semibold text-(--accent) hover:underline focus-visible:outline-2 focus-visible:outline-(--accent)"
                    >
                      {allOn ? "Clear" : "Select all"}
                    </button>
                  </div>
                )}
                {group.options.map((option) => {
                  const checked = selected.has(option.id);
                  return (
                    <label
                      key={option.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-1.5 transition-colors hover:bg-(--hover) has-focus-visible:bg-(--hover)"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(option.id)}
                        className="sr-only"
                      />
                      <CheckboxIndicator checked={checked} />
                      {option.leading}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-(--text)">
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-(--border) px-4 py-3">
        <span className="mr-auto text-xs text-(--muted)" aria-live="polite">
          {draft.selected.length} of {total} selected
        </span>
        <button
          type="button"
          onClick={() => setDraft(defaultValue)}
          className="h-9 rounded-lg px-3 text-sm font-semibold text-(--accent) hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => openChange(false)}
          className="h-9 rounded-lg bg-(--accent) px-4 text-sm font-bold text-(--on-accent) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          Done
        </button>
      </div>
    </FilterDropdown>
  );
}

/** The ids in `set`, in the order the options are listed. */
function orderedIds(
  groups: readonly MultiSelectGroup[],
  set: ReadonlySet<string>,
): string[] {
  return groups.flatMap((group) =>
    group.options
      .filter((option) => set.has(option.id))
      .map((option) => option.id),
  );
}
