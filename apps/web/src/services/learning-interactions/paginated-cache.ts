import type { InfiniteData } from "@tanstack/react-query";

export function isInfiniteCacheData<TPage>(
  value: unknown,
): value is InfiniteData<TPage> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { pages?: unknown }).pages) &&
      Array.isArray((value as { pageParams?: unknown }).pageParams),
  );
}

export function mapPaginatedCache<TPage>(
  value: TPage | InfiniteData<TPage> | undefined,
  updatePage: (page: TPage) => TPage,
): TPage | InfiniteData<TPage> | undefined {
  if (!value) return value;
  if (!isInfiniteCacheData<TPage>(value)) return updatePage(value);

  let changed = false;
  const pages = value.pages.map((page) => {
    const nextPage = updatePage(page);
    changed ||= nextPage !== page;
    return nextPage;
  });

  return changed ? { ...value, pages } : value;
}

export function mapFirstPaginatedPage<TPage>(
  value: TPage | InfiniteData<TPage> | undefined,
  updatePage: (page: TPage) => TPage,
): TPage | InfiniteData<TPage> | undefined {
  if (!value) return value;
  if (!isInfiniteCacheData<TPage>(value)) return updatePage(value);

  const firstPage = value.pages[0];
  if (firstPage === undefined) return value;
  const nextFirstPage = updatePage(firstPage);
  return nextFirstPage === firstPage
    ? value
    : { ...value, pages: [nextFirstPage, ...value.pages.slice(1)] };
}
