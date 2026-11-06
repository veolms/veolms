import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import type { ApiError } from "../../lib/api-error";
import {
  notificationKeys,
  type NotificationListFilters,
} from "./notifications.keys";
import { notificationsService } from "./notifications.service";
import {
  isNotificationStreamLive,
  startNotificationStream,
  subscribeNotificationStreamLive,
} from "./notifications.stream";

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
  // While the live stream (notifications.stream.ts) is connected it says
  // when to refetch, and the poll is only a safety net.
  const streamLive = useSyncExternalStore(
    subscribeNotificationStreamLive,
    isNotificationStreamLive,
    () => false,
  );
  return useQuery({
    queryKey: notificationKeys.summary(),
    queryFn: notificationsService.summary,
    enabled: options?.enabled ?? true,
    // Every open tab of every signed-in learner asks, so the interval is
    // most of this route's load (8% of all API requests at 30 s). A tab
    // in the background does not poll at all, and coming back to one asks
    // at once (focus), so a new badge still shows when it is looked at.
    staleTime: 60_000,
    refetchInterval: streamLive ? 10 * 60_000 : 120_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Keeps this tab's notifications live (Server-Sent Events) while `enabled`,
 * i.e. while someone is signed in. Mounted once, in the app shell.
 */
export function useNotificationStream(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return startNotificationStream(queryClient);
  }, [enabled, queryClient]);
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
