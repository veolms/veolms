import { useMemo, useState } from "react";
import {
  initialNotificationsList,
  initialRecentMentions,
  type NotificationDateGroup,
  type NotificationItem,
  type NotificationTabId,
  type RecentMentionItem,
} from "./notificationsData";

export interface UseNotificationsFilterReturn {
  notifications: readonly NotificationItem[];
  groupedNotifications: Record<NotificationDateGroup, readonly NotificationItem[]>;
  recentMentions: readonly RecentMentionItem[];
  totalFilteredCount: number;
  totalUnreadCount: number;
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
  toggleReadStatus: (id: string) => void;
  deleteNotification: (id: string) => void;
  resetFilters: () => void;
}

export function useNotificationsFilter(
  setNotice?: (message: string) => void,
): UseNotificationsFilterReturn {
  const [notificationsList, setNotificationsList] = useState<
    readonly NotificationItem[]
  >(initialNotificationsList);
  const [activeTab, setActiveTab] = useState<NotificationTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("latest");

  const resetFilters = () => {
    setActiveTab("all");
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setSortBy("latest");
  };

  const markAllAsRead = () => {
    setNotificationsList((prev) =>
      prev.map((item) => ({ ...item, isRead: true })),
    );
    setNotice?.("All notifications marked as read.");
  };

  const toggleReadStatus = (id: string) => {
    setNotificationsList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isRead: !item.isRead } : item,
      ),
    );
  };

  const deleteNotification = (id: string) => {
    setNotificationsList((prev) => prev.filter((item) => item.id !== id));
    setNotice?.("Notification deleted.");
  };

  // Live Tab Counts
  const tabCounts = useMemo(() => {
    const counts: Record<NotificationTabId, number> = {
      all: notificationsList.length,
      unread: 0,
      mentions: 0,
      "course-activity": 0,
      announcements: 0,
    };

    for (const item of notificationsList) {
      if (!item.isRead) {
        counts.unread += 1;
      }
      if (item.category === "mention") {
        counts.mentions += 1;
      }
      if (
        item.category === "course" ||
        item.category === "assignment" ||
        item.category === "reply" ||
        item.category === "reminder" ||
        item.category === "certificate"
      ) {
        counts["course-activity"] += 1;
      }
      if (item.category === "announcement" || item.category === "system") {
        counts.announcements += 1;
      }
    }

    return counts;
  }, [notificationsList]);

  // Filtered Notifications
  const filteredNotifications = useMemo(() => {
    let result = [...notificationsList];

    // Filter by Tab
    if (activeTab === "unread") {
      result = result.filter((item) => !item.isRead);
    } else if (activeTab === "mentions") {
      result = result.filter((item) => item.category === "mention");
    } else if (activeTab === "course-activity") {
      result = result.filter(
        (item) =>
          item.category === "course" ||
          item.category === "assignment" ||
          item.category === "reply" ||
          item.category === "reminder" ||
          item.category === "certificate",
      );
    } else if (activeTab === "announcements") {
      result = result.filter(
        (item) =>
          item.category === "announcement" || item.category === "system",
      );
    }

    // Filter by Category select
    if (categoryFilter !== "all") {
      result = result.filter((item) => item.category === categoryFilter);
    }

    // Filter by Status select
    if (statusFilter === "unread") {
      result = result.filter((item) => !item.isRead);
    } else if (statusFilter === "read") {
      result = result.filter((item) => item.isRead);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.body.toLowerCase().includes(q) ||
          (item.authorName && item.authorName.toLowerCase().includes(q)),
      );
    }

    // Sorting
    if (sortBy === "oldest") {
      result.reverse();
    } else if (sortBy === "unread") {
      result.sort((a, b) => (a.isRead === b.isRead ? 0 : a.isRead ? 1 : -1));
    }

    return result;
  }, [
    notificationsList,
    activeTab,
    categoryFilter,
    statusFilter,
    searchQuery,
    sortBy,
  ]);

  // Group by Date
  const groupedNotifications = useMemo(() => {
    const groups: Record<NotificationDateGroup, NotificationItem[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };

    for (const item of filteredNotifications) {
      groups[item.dateGroup].push(item);
    }

    return groups;
  }, [filteredNotifications]);

  return {
    notifications: filteredNotifications,
    groupedNotifications,
    recentMentions: initialRecentMentions,
    totalFilteredCount: filteredNotifications.length,
    totalUnreadCount: tabCounts.unread,
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
    markAllAsRead,
    toggleReadStatus,
    deleteNotification,
    resetFilters,
  };
}
