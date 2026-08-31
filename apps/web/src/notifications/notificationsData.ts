import type { Notification, NotificationCategory } from "@veolms/contracts";

export type NotificationDateGroup = "today" | "yesterday" | "earlier";

export interface NotificationItem {
  id: string;
  type: string;
  category: NotificationCategory;
  dateGroup: NotificationDateGroup;
  title: string;
  body: string;
  timestamp: string;
  isRead: boolean;
  iconType:
    | "graduation"
    | "chat"
    | "clipboard"
    | "calendar"
    | "at"
    | "book"
    | "bell"
    | "trophy"
    | "wallet"
    | "shield";
  iconColor: string;
  iconTextColor: string;
  actionUrl?: string;
}

export type NotificationTabId =
  "all" | "unread" | "mentions" | "course-activity" | "announcements";

export interface RecentMentionItem {
  id: string;
  title: string;
  context: string;
  timestamp: string;
  actionUrl?: string;
}

function startOfLocalDay(value: Date): number {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  ).getTime();
}

function dateGroup(createdAt: Date, now: Date): NotificationDateGroup {
  const dayDifference = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(createdAt)) / 86_400_000,
  );
  if (dayDifference <= 0) return "today";
  if (dayDifference === 1) return "yesterday";
  return "earlier";
}

function timestamp(createdAt: Date, now: Date): string {
  const group = dateGroup(createdAt, now);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(createdAt);
  if (group === "today") return time;
  if (group === "yesterday") return `Yesterday, ${time}`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(createdAt);
}

function visualFor(notification: Notification) {
  if (notification.type === "user.mentioned") {
    return {
      iconType: "at" as const,
      iconColor: "rgba(168, 85, 247, 0.16)",
      iconTextColor: "#c084fc",
    };
  }
  if (notification.type === "certificate.generated") {
    return {
      iconType: "trophy" as const,
      iconColor: "rgba(234, 179, 8, 0.16)",
      iconTextColor: "#facc15",
    };
  }
  if (notification.category === "transactional") {
    return {
      iconType: "wallet" as const,
      iconColor: "rgba(2, 132, 199, 0.16)",
      iconTextColor: "#38bdf8",
    };
  }
  if (notification.category === "social") {
    return {
      iconType: "chat" as const,
      iconColor: "rgba(34, 197, 94, 0.16)",
      iconTextColor: "#4ade80",
    };
  }
  if (notification.category === "learning") {
    return {
      iconType: notification.type.includes("assignment")
        ? ("clipboard" as const)
        : ("graduation" as const),
      iconColor: "rgba(139, 92, 246, 0.16)",
      iconTextColor: "#a78bfa",
    };
  }
  return {
    iconType: "shield" as const,
    iconColor: "rgba(148, 163, 184, 0.16)",
    iconTextColor: "#94a3b8",
  };
}

export function toNotificationItem(
  notification: Notification,
  now = new Date(),
): NotificationItem {
  const createdAt = new Date(notification.createdAt);
  return {
    id: notification.id,
    type: notification.type,
    category: notification.category,
    dateGroup: dateGroup(createdAt, now),
    title: notification.title,
    body: notification.body,
    timestamp: timestamp(createdAt, now),
    isRead: notification.readAt !== null,
    ...visualFor(notification),
    ...(notification.deepLink ? { actionUrl: notification.deepLink } : {}),
  };
}

export function toRecentMention(item: NotificationItem): RecentMentionItem {
  return {
    id: item.id,
    title: item.title,
    context: item.body,
    timestamp: item.timestamp,
    ...(item.actionUrl ? { actionUrl: item.actionUrl } : {}),
  };
}
