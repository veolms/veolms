import type {
  OrdersListQueryInput,
  OrderStatsQuery,
  OrderView,
} from "@veolms/contracts";

export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (params?: OrdersListQueryInput) =>
    [...orderKeys.lists(), params] as const,
  stats: (params?: OrderStatsQuery) =>
    [...orderKeys.all, "stats", params] as const,
  detail: (id: string, view?: OrderView) =>
    [...orderKeys.all, "detail", id, view] as const,
  invoice: (id: string, view?: OrderView) =>
    [...orderKeys.all, "invoice", id, view] as const,
};
