import type {
  Notification,
  NotificationListResponse,
  UpdateNotificationPreferences,
} from "@veolms/contracts";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  notificationKeys,
  type NotificationListFilters,
} from "./notifications.keys";
import { notificationsService } from "./notifications.service";

function updateCachedNotificationLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updateItems: (
    items: NotificationListResponse["items"],
    filters: NotificationListFilters,
  ) => NotificationListResponse["items"],
) {
  const queries = queryClient
    .getQueryCache()
    .findAll({ queryKey: notificationKeys.lists() });

  for (const query of queries) {
    const queryFilters = query.queryKey[2];
    const filters =
      typeof queryFilters === "object" && queryFilters !== null
        ? (queryFilters as NotificationListFilters)
        : {};
    const current = query.state.data as
      | InfiniteData<NotificationListResponse>
      | undefined;

    if (!current) continue;

    let changed = false;
    const pages = current.pages.map((page) => {
      const items = updateItems(page.items, filters);
      const pageChanged =
        items.length !== page.items.length ||
        items.some((item, index) => item !== page.items[index]);
      if (!pageChanged) return page;

      changed = true;
      return { ...page, items };
    });

    if (changed) {
      queryClient.setQueryData<InfiniteData<NotificationListResponse>>(
        query.queryKey,
        { ...current, pages },
      );
    }
  }
}

function invalidateReadStatusFilteredLists(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const filteredQueries = queryClient
    .getQueryCache()
    .findAll({ queryKey: notificationKeys.lists() })
    .filter((query) => {
      const filters = query.queryKey[2];
      return (
        typeof filters === "object" &&
        filters !== null &&
        "unread" in filters
      );
    });

  return Promise.all(
    filteredQueries.map((query) =>
      queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true }),
    ),
  );
}

function invalidateNotificationSummary(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return queryClient.invalidateQueries({
    queryKey: notificationKeys.summary(),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsService.markRead,
    onSuccess: async (updatedNotification: Notification) => {
      updateCachedNotificationLists(queryClient, (items, filters) => {
        if (filters.unread === true) {
          return items.filter((item) => item.id !== updatedNotification.id);
        }
        if (filters.unread === false) return items;
        return items.map((item) =>
          item.id === updatedNotification.id ? updatedNotification : item,
        );
      });
      await Promise.all([
        invalidateReadStatusFilteredLists(queryClient),
        invalidateNotificationSummary(queryClient),
      ]);
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsService.markAllRead,
    onSuccess: async () => {
      const readAt = new Date().toISOString();
      updateCachedNotificationLists(queryClient, (items, filters) => {
        if (filters.unread === true) return [];
        if (filters.unread === false) return items;
        return items.map((item) =>
          item.readAt === null ? { ...item, readAt } : item,
        );
      });
      await Promise.all([
        invalidateReadStatusFilteredLists(queryClient),
        invalidateNotificationSummary(queryClient),
      ]);
    },
  });
}

export function useArchiveNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsService.archive,
    onSuccess: async (_result, notificationId) => {
      updateCachedNotificationLists(queryClient, (items) =>
        items.filter((item) => item.id !== notificationId),
      );
      await invalidateNotificationSummary(queryClient);
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNotificationPreferences) =>
      notificationsService.updatePreferences(input),
    onSuccess: (data) => {
      queryClient.setQueryData(notificationKeys.preferences(), data);
    },
  });
}
