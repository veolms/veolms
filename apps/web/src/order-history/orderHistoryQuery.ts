import type { OrderStatus } from "@veolms/contracts";

/**
 * The order statuses behind each status the Purchase History filter offers.
 * It is the reverse of how an order's status is shown in the list
 * (`adaptOrderToOrderHistoryItem`): one label can cover several statuses.
 */
const ORDER_STATUSES_BY_FILTER: Readonly<
  Record<string, readonly OrderStatus[]>
> = {
  completed: ["paid"],
  processing: ["pending", "payment_processing"],
  failed: ["payment_failed", "expired", "cancelled"],
  refunded: ["refunded", "partially_refunded"],
};

/** The longest search text the order list accepts. */
const MAX_SEARCH_LENGTH = 100;

export interface OrderHistoryListFilter {
  /** Comma-separated order statuses, as the order list query takes them. */
  statuses?: string;
  search?: string;
}

/**
 * What the Purchase History status filter and search box ask the server
 * for, so both look through every purchase and not only the pages loaded.
 * "all", an unknown status or an empty search add nothing to the query.
 */
export function buildOrderHistoryListFilter(
  statusFilter: string,
  searchText: string,
): OrderHistoryListFilter {
  const filter: OrderHistoryListFilter = {};

  const statuses = ORDER_STATUSES_BY_FILTER[statusFilter];
  if (statuses) filter.statuses = statuses.join(",");

  // The list shows an order number with a leading "#" that is not part of
  // the number itself.
  const search = searchText
    .trim()
    .replace(/^#+/, "")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
  if (search) filter.search = search;

  return filter;
}
