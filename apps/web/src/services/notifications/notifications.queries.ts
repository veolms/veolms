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

export function useNotificationSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: notificationKeys.summary(),
    queryFn: notificationsService.summary,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    // Every open tab asks on this interval, which made the summary the API's
    // most-called route. Two minutes is soon enough for a badge; a tab in the
    // background does not ask (React Query's default), and coming back to it
    // asks at once.
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationPreferences(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: notificationsService.getPreferences,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export type NotificationQueryError = ApiError;
