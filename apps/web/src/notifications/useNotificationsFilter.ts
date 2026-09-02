import type { NotificationCategory } from "@veolms/contracts";
import { useDeferredValue, useMemo, useState } from "react";

import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationSummary,
  useNotifications,
} from "../services/notifications";
import {
  toNotificationItem,
  toRecentMention,
  type NotificationDateGroup,
  type NotificationItem,
  type NotificationTabId,
  type RecentMentionItem,
} from "./notificationsData";

export interface UseNotificationsFilterReturn {
  notifications: readonly NotificationItem[];
  groupedNotifications: Record<
    NotificationDateGroup,
    readonly NotificationItem[]
  >;
  recentMentions: readonly RecentMentionItem[];
  totalFilteredCount: number;
  activeTab: NotificationTabId;
  setActiveTab: (tab: NotificationTabId) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  tabCounts: Record<NotificationTabId, number>;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
  archiveNotification: (id: string) => void;
  resetFilters: () => void;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export function useNotificationsFilter(
  setNotice?: (message: string) => void,
): UseNotificationsFilterReturn {
  const [activeTab, setActiveTab] = useState<NotificationTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const filters = useMemo(() => {
    const next: {
      type?: string;
      category?: NotificationCategory;
      unread?: boolean;
      search?: string;
      limit: number;
    } = { limit: 25 };
    if (activeTab === "unread") next.unread = true;
    if (activeTab === "mentions") next.type = "user.mentioned";
    if (activeTab === "course-activity") next.category = "learning";
    if (activeTab === "announcements") next.category = "system";
    if (categoryFilter !== "all") {
      next.category = categoryFilter as NotificationCategory;
    }
    if (statusFilter === "unread") next.unread = true;
    if (statusFilter === "read") next.unread = false;
    if (deferredSearch) next.search = deferredSearch;
    return next;
  }, [activeTab, categoryFilter, deferredSearch, statusFilter]);

  const feed = useNotifications(filters);
  const mentions = useNotifications({ type: "user.mentioned", limit: 3 });
  const summary = useNotificationSummary();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const archiveMutation = useArchiveNotification();

  const notifications = useMemo(() => {
    const items =
      feed.data?.pages
        .flatMap((page) => page.items)
        .map((item) => toNotificationItem(item)) ?? [];
    if (sortBy === "oldest") return [...items].reverse();
    if (sortBy === "unread") {
      return [...items].sort((left, right) =>
        left.isRead === right.isRead ? 0 : left.isRead ? 1 : -1,
      );
    }
    return items;
  }, [feed.data, sortBy]);

  const recentMentions = useMemo(
    () =>
      mentions.data?.pages
        .flatMap((page) => page.items)
        .slice(0, 3)
        .map((item) => toRecentMention(toNotificationItem(item))) ?? [],
    [mentions.data],
  );

  const groupedNotifications = useMemo(() => {
    const groups: Record<NotificationDateGroup, NotificationItem[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const item of notifications) groups[item.dateGroup].push(item);
    return groups;
  }, [notifications]);

  const tabCounts = useMemo<Record<NotificationTabId, number>>(
    () => ({
      all: summary.data?.totalCount ?? 0,
      unread: summary.data?.unreadCount ?? 0,
      mentions: summary.data?.mentionCount ?? 0,
      "course-activity": summary.data?.learningCount ?? 0,
      announcements: summary.data?.announcementCount ?? 0,
    }),
    [summary.data],
  );

  const resetFilters = () => {
    setActiveTab("all");
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setSortBy("latest");
  };

  return {
    notifications,
    groupedNotifications,
    recentMentions,
    totalFilteredCount: notifications.length,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    tabCounts,
    markAllAsRead: () =>
      markAllReadMutation.mutate(undefined, {
        onSuccess: () => setNotice?.("All notifications marked as read."),
      }),
    markAsRead: (id) => markReadMutation.mutate(id),
    archiveNotification: (id) =>
      archiveMutation.mutate(id, {
        onSuccess: () => setNotice?.("Notification archived."),
      }),
    resetFilters,
    isLoading: feed.isPending,
    isError: feed.isError,
    hasNextPage: Boolean(feed.hasNextPage),
    isFetchingNextPage: feed.isFetchingNextPage,
    loadMore: () => void feed.fetchNextPage(),
    refetch: () => void feed.refetch(),
  };
}
