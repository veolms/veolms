import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import {
  Fragment,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";

export interface PickerOption<Value extends string> {
  value: Value;
  label: string;
  /** A quieter line under the label, or beside it. */
  description?: string;
  /** Shown after the label in muted text, e.g. "(you)". */
  note?: string;
  icon: ReactNode;
  /** A key that picks it while the list is open (1–9). */
  shortcut?: string;
  /** A heading above the first option of a group. */
  group?: string;
}

/**
 * A field's value as a button that opens a searchable list, as in the
 * report panel's Properties: Status, Assignee, Priority, Category. Arrow
 * keys move, Enter picks, a number picks its option, Esc closes.
 */
export function PropertyPicker<Value extends string>({
  label,
  value,
  options,
  onSelect,
  open,
  onOpenChange,
  trigger,
  searchPlaceholder,
  shortcutKey,
  footer,
  disabled = false,
}: {
  /** The field's name, for assistive technology. */
  label: string;
  value: Value | null;
  options: readonly PickerOption<Value>[];
  onSelect: (value: Value) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the button shows: the current value. */
  trigger: ReactNode;
  searchPlaceholder: string;
  /** The key that opens it from the panel, shown in the search box. */
  shortcutKey?: string;
  footer?: ReactNode;
  disabled?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [options, query]);

  const setOpen = (next: boolean) => {
    if (next) {
      setQuery("");
      const current = options.findIndex((option) => option.value === value);
      setActive(Math.max(0, current));
    }
    onOpenChange(next);
  };

  const pick = (option: PickerOption<Value> | undefined) => {
    if (!option) return;
    onOpenChange(false);
    if (option.value !== value) onSelect(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(shown.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(shown[active]);
    } else if (!query && /^[0-9]$/u.test(event.key)) {
      const option = options.find((item) => item.shortcut === event.key);
      if (option) {
        event.preventDefault();
        pick(option);
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={label}
        className="inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-lg px-2 text-[0.82rem] font-semibold text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-60 data-popup-open:bg-(--hover) data-popup-open:ring-1 data-popup-open:ring-(--accent)/50"
      >
        {trigger}
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden="true"
          className="shrink-0 text-(--muted)"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="flex w-[19rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3">
          <MagnifyingGlass
            size={15}
            aria-hidden="true"
            className="shrink-0 text-(--muted)"
          />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              shown[active] ? `${listId}-${shown[active].value}` : undefined
            }
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-(--text) outline-none placeholder:text-(--muted)"
          />
          {shortcutKey ? (
            <kbd className="rounded border border-[color-mix(in_srgb,var(--text)_14%,transparent)] px-1.5 font-sans text-[0.68rem] font-semibold text-(--muted)">
              {shortcutKey}
            </kbd>
          ) : null}
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="m-0 max-h-72 list-none overflow-y-auto p-1"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-(--muted)">
              Nothing matches.
            </li>
          ) : null}
          {shown.map((option, index) => {
            const selected = option.value === value;
            const groupStart =
              option.group &&
              (index === 0 || shown[index - 1]?.group !== option.group);
            return (
              <Fragment key={option.value}>
                {groupStart ? (
                  <li
                    role="presentation"
                    className="px-2.5 pt-2.5 pb-1 text-[0.66rem] font-bold tracking-[0.08em] text-(--muted) uppercase"
                  >
                    {option.group}
                  </li>
                ) : null}
                <li
                  id={`${listId}-${option.value}`}
                  role="option"
                  aria-selected={selected}
                  data-active={index === active || undefined}
                  onPointerMove={() => setActive(index)}
                  onClick={() => pick(option)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 data-active:bg-(--hover)"
                >
                  {option.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.84rem] font-semibold text-(--text)">
                      {option.label}
                      {option.note ? (
                        <span className="ml-1 font-normal text-(--muted)">
                          {option.note}
                        </span>
                      ) : null}
                    </span>
                    {option.description ? (
                      <span className="block truncate text-xs text-(--muted)">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check
                      size={15}
                      weight="bold"
                      aria-hidden="true"
                      className="shrink-0 text-(--accent)"
                    />
                  ) : option.shortcut ? (
                    <kbd className="rounded border border-[color-mix(in_srgb,var(--text)_14%,transparent)] px-1.5 font-sans text-[0.68rem] font-semibold text-(--muted)">
                      {option.shortcut}
                    </kbd>
                  ) : null}
                </li>
              </Fragment>
            );
          })}
        </ul>
        {footer ? (
          <div className="flex items-center gap-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2 text-xs text-(--muted)">
            {footer}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
