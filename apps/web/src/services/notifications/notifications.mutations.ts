import type { UpdateNotificationPreferences } from "@veolms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notificationKeys } from "./notifications.keys";
import { notificationsService } from "./notifications.service";

function useRefreshNotifications() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.summary() }),
    ]);
  };
}

export function useMarkNotificationRead() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: notificationsService.markRead,
    onSuccess: refresh,
  });
}

export function useMarkAllNotificationsRead() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: notificationsService.markAllRead,
    onSuccess: refresh,
  });
}

export function useArchiveNotification() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: notificationsService.archive,
    onSuccess: refresh,
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
