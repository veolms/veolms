import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { useDebounceValue } from "../../hooks/useDebounce";
import {
  fromDayKey,
  isDateRangeKey,
  resolveDateRange,
  toDayKey,
  type DateRangeKey,
} from "../../orders/ordersDateRange";

/** A list's date range: one of the Orders ranges, or no bound at all. */
export type AdminRangeKey = DateRangeKey | "all";

export const ADMIN_PAGE_SIZES = [10, 25, 50] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

export interface AdminListUrl {
  /** One value from the URL, or null. */
  value: (key: string) => string | null;
  /** A comma list from the URL, keeping only the allowed values. */
  list: <T extends string>(key: string, allowed?: readonly T[]) => T[];
  /** Changes values (null or an empty list removes one); back to page 1. */
  set: (changes: Record<string, string | readonly string[] | null>) => void;

  page: number;
  setPage: (page: number) => void;
  pageSize: AdminPageSize;
  setPageSize: (size: AdminPageSize) => void;

  range: AdminRangeKey;
  customFrom: Date | null;
  customTo: Date | null;
  setRange: (range: Exclude<AdminRangeKey, "custom">) => void;
  setCustomRange: (from: Date, to: Date) => void;
  /** The range as the API's days; both left out for "all". */
  days: { from?: string; to?: string };

  /** The search box's text, ahead of the URL while typing. */
  searchText: string;
  setSearchText: (text: string) => void;
  /** The search the list is filtered by (the URL's). */
  search: string;

  /** The row open in the side panel. */
  openId: string | null;
  setOpenId: (id: string | null) => void;

  /** Anything beyond the defaults is chosen. */
  isFiltered: boolean;
  reset: () => void;
}

/** Keys kept when the filters are reset or changed. */
const PAGE_KEYS = ["page", "open"];

/**
 * A list's filters kept in the URL, as on the Orders page: a link or a
 * reload shows the same list, and Back undoes nothing by surprise (each
 * change replaces the entry). The search box updates the URL once typing
 * pauses.
 */
export function useAdminListUrl(options: {
  defaultRange: AdminRangeKey;
}): AdminListUrl {
  const { defaultRange } = options;
  const [params, setParams] = useSearchParams();

  const write = useCallback(
    (change: (next: URLSearchParams) => void) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          change(next);
          return next;
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  );

  const value = useCallback((key: string) => params.get(key), [params]);
  const list = useCallback(
    <T extends string>(key: string, allowed?: readonly T[]): T[] => {
      const items = (params.get(key) ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return [
        ...new Set(
          allowed
            ? items.filter((item) =>
                (allowed as readonly string[]).includes(item),
              )
            : items,
        ),
      ] as T[];
    },
    [params],
  );

  const set = useCallback(
    (changes: Record<string, string | readonly string[] | null>) =>
      write((next) => {
        for (const [key, change] of Object.entries(changes)) {
          const text = Array.isArray(change)
            ? change.join(",")
            : ((change as string | null) ?? "");
          if (text) next.set(key, text);
          else next.delete(key);
        }
        next.delete("page");
      }),
    [write],
  );

  const pageValue = Number(params.get("page"));
  const page = Number.isInteger(pageValue) && pageValue > 1 ? pageValue : 1;
  const setPage = useCallback(
    (nextPage: number) =>
      write((next) => {
        if (nextPage > 1) next.set("page", String(nextPage));
        else next.delete("page");
      }),
    [write],
  );
  const sizeValue = Number(params.get("size"));
  const pageSize: AdminPageSize = (
    ADMIN_PAGE_SIZES as readonly number[]
  ).includes(sizeValue)
    ? (sizeValue as AdminPageSize)
    : 25;
  const setPageSize = useCallback(
    (size: AdminPageSize) => set({ size: size === 25 ? null : String(size) }),
    [set],
  );

  // The range: "all", a chip or quick range, or two days.
  const rangeParam = params.get("range");
  const range: AdminRangeKey =
    rangeParam === "all" || (rangeParam && isDateRangeKey(rangeParam))
      ? (rangeParam as AdminRangeKey)
      : defaultRange;
  const customFrom = fromDayKey(params.get("from"));
  const customTo = fromDayKey(params.get("to"));
  const setRange = useCallback(
    (next: Exclude<AdminRangeKey, "custom">) =>
      set({
        range: next === defaultRange ? null : next,
        from: null,
        to: null,
      }),
    [defaultRange, set],
  );
  const setCustomRange = useCallback(
    (from: Date, to: Date) =>
      set({ range: "custom", from: toDayKey(from), to: toDayKey(to) }),
    [set],
  );
  const fromKey = customFrom ? toDayKey(customFrom) : null;
  const toKey = customTo ? toDayKey(customTo) : null;
  const today = toDayKey(new Date());
  const days = useMemo(() => {
    if (range === "all") return {};
    const resolved = resolveDateRange(range, new Date(), {
      from: fromDayKey(fromKey),
      to: fromDayKey(toKey),
    });
    return { from: toDayKey(resolved.from), to: toDayKey(resolved.to) };
    // `today` moves the range on with the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, fromKey, toKey, today]);

  // Search: shown at once, written to the URL once typing pauses.
  const search = params.get("q") ?? "";
  const [searchText, setSearchText] = useState(search);
  const [debounced] = useDebounceValue(searchText.trim(), 300);
  useEffect(() => {
    if (debounced !== search) set({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows typing only
  }, [debounced]);
  // A reset or a link changes the URL's search: the box follows it.
  useEffect(() => {
    setSearchText((current) => (current.trim() === search ? current : search));
  }, [search]);

  const openId = params.get("open");
  const setOpenId = useCallback(
    (id: string | null) =>
      write((next) => {
        if (id) next.set("open", id);
        else next.delete("open");
      }),
    [write],
  );

  const isFiltered = [...params.keys()].some(
    (key) => !PAGE_KEYS.includes(key) && key !== "size",
  );
  const reset = useCallback(() => {
    setSearchText("");
    write((next) => {
      for (const key of [...next.keys()]) {
        if (key !== "size") next.delete(key);
      }
    });
  }, [write]);

  return {
    value,
    list,
    set,
    page,
    setPage,
    pageSize,
    setPageSize,
    range,
    customFrom,
    customTo,
    setRange,
    setCustomRange,
    days,
    searchText,
    setSearchText,
    search,
    openId,
    setOpenId,
    isFiltered,
    reset,
  };
}

/**
 * The values a multi-select's choice stands for: what was ticked, or with
 * Exclude on, every option but those. Nothing ticked is no filter.
 */
export function includedValues<T extends string>(
  selected: readonly string[],
  mode: "include" | "exclude",
  all: readonly T[],
): T[] {
  if (mode === "include") {
    return all.filter((item) => selected.includes(item));
  }
  return all.filter((item) => !selected.includes(item));
}

/** "All statuses", "Approved", "3 statuses". */
export function multiLabel(
  selected: readonly string[],
  labels: Readonly<Record<string, string>>,
  nouns: readonly [one: string, many: string],
  total: number,
): string {
  if (selected.length === 0 || selected.length === total) {
    return `All ${nouns[1]}`;
  }
  if (selected.length === 1) {
    return labels[selected[0]!] ?? `1 ${nouns[0]}`;
  }
  return `${selected.length} ${nouns[1]}`;
}
