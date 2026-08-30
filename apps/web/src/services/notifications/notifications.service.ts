import type {
  Notification,
  NotificationListResponse,
  NotificationPreferencesResponse,
  NotificationSummary,
  UpdateNotificationPreferences,
} from "@veolms/contracts";

import { api } from "../../lib/api-client";
import type { NotificationListFilters } from "./notifications.keys";

export const notificationsService = {
  list: (
    filters: NotificationListFilters & { cursor?: string },
  ): Promise<NotificationListResponse> =>
    api.get<NotificationListResponse>("/notifications", {
      params: { limit: 25, ...filters },
    }),

  summary: (): Promise<NotificationSummary> =>
    api.get<NotificationSummary>("/notifications/summary"),

  markRead: (id: string): Promise<Notification> =>
    api.patch<Notification>(`/notifications/${id}/read`),

  markAllRead: (): Promise<{ updatedCount: number }> =>
    api.post<{ updatedCount: number }>("/notifications/read-all"),

  archive: (id: string): Promise<{ archived: true }> =>
    api.patch<{ archived: true }>(`/notifications/${id}/archive`),

  getPreferences: (): Promise<NotificationPreferencesResponse> =>
    api.get<NotificationPreferencesResponse>("/notification-preferences"),

  updatePreferences: (
    input: UpdateNotificationPreferences,
  ): Promise<NotificationPreferencesResponse> =>
    api.put<NotificationPreferencesResponse>(
      "/notification-preferences",
      input,
    ),
};
