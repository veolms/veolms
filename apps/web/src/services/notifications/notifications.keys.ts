import type { NotificationListQuery } from "@veolms/contracts";

export type NotificationListFilters = Omit<NotificationListQuery, "limit"> & {
  limit?: number;
};

export const notificationKeys = {
  all: ["notifications"] as const,
  lists: () => [...notificationKeys.all, "list"] as const,
  list: (filters: NotificationListFilters) =>
    [...notificationKeys.lists(), filters] as const,
  summary: () => [...notificationKeys.all, "summary"] as const,
  preferences: () => [...notificationKeys.all, "preferences"] as const,
};
