import type { ShortLink } from "@veolms/contracts";

export type LinkTypeFilter = "all" | "redirect" | "rewrite";
export type LinkStatusFilter = "all" | "active" | "paused";
export type LinkSort = "newest" | "visits" | "recent-visit" | "path";

export interface LinkFilters {
  search: string;
  type: LinkTypeFilter;
  status: LinkStatusFilter;
  sort: LinkSort;
}

export const DEFAULT_LINK_FILTERS: LinkFilters = {
  search: "",
  type: "all",
  status: "all",
  sort: "newest",
};

const byNewest = (a: ShortLink, b: ShortLink) =>
  b.createdAt.localeCompare(a.createdAt);

/**
 * The links that match the search (path, destination or creator) and the
 * filters, in the chosen order. An academy has tens of links, not
 * thousands, so this runs in the browser on the whole list.
 */
export function filterLinks(
  links: readonly ShortLink[],
  { search, type, status, sort }: LinkFilters,
): ShortLink[] {
  const query = search.trim().toLowerCase();
  const matches = links.filter(
    (link) =>
      (type === "all" || link.mode === type) &&
      (status === "all" || link.isActive === (status === "active")) &&
      (!query ||
        link.path.includes(query) ||
        link.destination.toLowerCase().includes(query) ||
        (link.createdBy?.name ?? "").toLowerCase().includes(query)),
  );
  const order: Record<LinkSort, (a: ShortLink, b: ShortLink) => number> = {
    newest: byNewest,
    visits: (a, b) => b.visitCount - a.visitCount || byNewest(a, b),
    "recent-visit": (a, b) =>
      (b.lastVisitedAt ?? "").localeCompare(a.lastVisitedAt ?? "") ||
      byNewest(a, b),
    path: (a, b) => a.path.localeCompare(b.path),
  };
  return matches.sort(order[sort]);
}

export function hasActiveLinkFilters(filters: LinkFilters): boolean {
  return (
    filters.search !== "" ||
    filters.type !== "all" ||
    filters.status !== "all" ||
    filters.sort !== "newest"
  );
}
