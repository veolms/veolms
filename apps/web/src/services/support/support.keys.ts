import type { SupportAdminListQuery } from "@veolms/contracts";

export type SupportAdminFilters = Omit<
  SupportAdminListQuery,
  "cursor" | "limit"
>;

export const supportKeys = {
  all: ["support"] as const,
  mine: () => [...supportKeys.all, "mine"] as const,
  unread: () => [...supportKeys.all, "unread"] as const,
  ticket: (ticketId: string, asStaff = false) =>
    [
      ...supportKeys.all,
      "ticket",
      ticketId,
      asStaff ? "staff" : "own",
    ] as const,
  staffLists: () => [...supportKeys.all, "staff", "list"] as const,
  staffList: (filters: SupportAdminFilters) =>
    [...supportKeys.staffLists(), filters] as const,
  staffStats: () => [...supportKeys.all, "staff", "stats"] as const,
  team: () => [...supportKeys.all, "staff", "team"] as const,
};
