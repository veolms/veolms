import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { ApiError } from "../../lib/api-error";
import {
  notificationKeys,
  type NotificationListFilters,
} from "./notifications.keys";
import { notificationsService } from "./notifications.service";

export function useNotifications(filters: NotificationListFilters) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: ({ pageParam }) =>
      notificationsService.list({
        ...filters,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationSummary() {
  return useQuery({
    queryKey: notificationKeys.summary(),
    queryFn: notificationsService.summary,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: notificationsService.getPreferences,
    staleTime: 60_000,
  });
}

export type NotificationQueryError = ApiError;
