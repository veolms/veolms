import type {
  NotificationListResponse,
  NotificationPreferencesResponse,
  NotificationReadState,
  NotificationSummary,
  UpdateNotificationPreferences,
} from "@veolms/contracts";

import { api, getApiRequestUrl } from "../../lib/api-client";
import type { NotificationListFilters } from "./notifications.keys";

export const notificationsService = {
  list: (
    filters: NotificationListFilters & { cursor?: string },
  ): Promise<NotificationListResponse> =>
    api.get<NotificationListResponse>("/notifications", {
      params: { limit: 25, ...filters },
    }),

  /**
   * Server-Sent Events: `ready` once open, `changed` when this user's
   * notifications change. Carries no notifications; refetch on each.
   */
  openChangeStream: (): EventSource =>
    new window.EventSource(getApiRequestUrl("/notifications/stream"), {
      withCredentials: true,
    }),

  summary: (): Promise<NotificationSummary> =>
    api.get<NotificationSummary>("/notifications/summary"),

  markRead: (id: string): Promise<NotificationReadState> =>
    api.patch<NotificationReadState>(`/notifications/${id}/read`),

  markUnread: (id: string): Promise<NotificationReadState> =>
    api.patch<NotificationReadState>(`/notifications/${id}/unread`),

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
