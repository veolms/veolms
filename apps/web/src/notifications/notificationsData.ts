export type NotificationCategory =
  | "course"
  | "reply"
  | "assignment"
  | "mention"
  | "reminder"
  | "certificate"
  | "payment"
  | "announcement"
  | "system";

export type NotificationDateGroup = "today" | "yesterday" | "earlier";

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  dateGroup: NotificationDateGroup;
  title: string;
  body: string;
  timestamp: string; // e.g. "10:24 AM", "Yesterday, 6:10 PM", "May 7, 5:45 PM"
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
  iconColor: string; // Background color for badge
  iconTextColor: string;
  actionUrl?: string;
  authorName?: string;
  authorAvatar?: string;
}

export type NotificationTabId =
  | "all"
  | "unread"
  | "mentions"
  | "course-activity"
  | "announcements";

export interface RecentMentionItem {
  id: string;
  authorName: string;
  authorAvatar: string;
  timestamp: string; // e.g. "18 min ago", "2h ago", "1d ago"
  context: string;
}

export const initialNotificationsList: readonly NotificationItem[] = [
  // Today
  {
    id: "notif-1",
    category: "course",
    dateGroup: "today",
    title: "New course published",
    body: '"Advanced TypeScript Mastery" is now available.',
    timestamp: "10:24 AM",
    isRead: false,
    iconType: "graduation",
    iconColor: "rgba(139, 92, 246, 0.16)", // Purple soft
    iconTextColor: "#a78bfa",
    actionUrl: "/courses",
  },
  {
    id: "notif-2",
    category: "reply",
    dateGroup: "today",
    title: "Instructor replied to your question",
    body: 'John Doe replied in "The Ultimate TypeScript Course".',
    timestamp: "9:15 AM",
    isRead: false,
    iconType: "chat",
    iconColor: "rgba(34, 197, 94, 0.16)", // Green soft
    iconTextColor: "#4ade80",
    actionUrl: "/discussions",
  },
  {
    id: "notif-3",
    category: "assignment",
    dateGroup: "today",
    title: "Assignment graded",
    body: 'Your assignment "React Project - Phase 1" has been graded.',
    timestamp: "8:42 AM",
    isRead: false,
    iconType: "clipboard",
    iconColor: "rgba(59, 130, 246, 0.16)", // Blue soft
    iconTextColor: "#60a5fa",
  },
  {
    id: "notif-4",
    category: "assignment",
    dateGroup: "today",
    title: "Assignment due tomorrow",
    body: '"Backend API Development" is due tomorrow at 11:59 PM.',
    timestamp: "7:30 AM",
    isRead: false,
    iconType: "calendar",
    iconColor: "rgba(249, 115, 22, 0.16)", // Orange soft
    iconTextColor: "#fb923c",
  },

  // Yesterday
  {
    id: "notif-5",
    category: "mention",
    dateGroup: "yesterday",
    title: "You were mentioned in a discussion",
    body: 'Anurag Singh mentioned you in "Understanding mapped types with modifiers".',
    timestamp: "Yesterday, 6:10 PM",
    isRead: false,
    iconType: "at",
    iconColor: "rgba(168, 85, 247, 0.16)", // Purple soft
    iconTextColor: "#c084fc",
    authorName: "Anurag Singh",
    authorAvatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    actionUrl: "/discussions",
  },
  {
    id: "notif-6",
    category: "course",
    dateGroup: "yesterday",
    title: "Course content updated",
    body: '"Complete Backend with Node.js" has new materials.',
    timestamp: "Yesterday, 11:00 AM",
    isRead: false,
    iconType: "book",
    iconColor: "rgba(20, 184, 166, 0.16)", // Teal soft
    iconTextColor: "#2dd4bf",
    actionUrl: "/courses",
  },
  {
    id: "notif-7",
    category: "reminder",
    dateGroup: "yesterday",
    title: "Learning reminder",
    body: 'Don\'t forget to continue "Data Structures & Algorithms".',
    timestamp: "Yesterday, 8:30 AM",
    isRead: true,
    iconType: "bell",
    iconColor: "rgba(139, 92, 246, 0.16)",
    iconTextColor: "#a78bfa",
  },

  // Earlier
  {
    id: "notif-8",
    category: "certificate",
    dateGroup: "earlier",
    title: "Certificate earned",
    body: 'Congratulations! You earned a certificate for "PostgreSQL Mastery".',
    timestamp: "May 7, 5:45 PM",
    isRead: true,
    iconType: "trophy",
    iconColor: "rgba(234, 179, 8, 0.16)", // Yellow soft
    iconTextColor: "#facc15",
  },
  {
    id: "notif-9",
    category: "payment",
    dateGroup: "earlier",
    title: "Payment received",
    body: 'Your payment for "GraphQL API Masterclass" was successful.',
    timestamp: "May 7, 2:20 PM",
    isRead: true,
    iconType: "wallet",
    iconColor: "rgba(2, 132, 199, 0.16)", // Sky blue soft
    iconTextColor: "#38bdf8",
    actionUrl: "/orders",
  },
  {
    id: "notif-10",
    category: "system",
    dateGroup: "earlier",
    title: "Scheduled maintenance",
    body: "We'll be back online on May 9, 12:00 AM (UTC).",
    timestamp: "May 7, 9:00 AM",
    isRead: true,
    iconType: "shield",
    iconColor: "rgba(148, 163, 184, 0.16)", // Slate soft
    iconTextColor: "#94a3b8",
  },
  {
    id: "notif-11",
    category: "announcement",
    dateGroup: "earlier",
    title: "Community Hackathon Announced",
    body: "Join our Summer 2025 Fullstack Hackathon! Submissions open May 15.",
    timestamp: "May 5, 10:00 AM",
    isRead: false,
    iconType: "bell",
    iconColor: "rgba(245, 158, 11, 0.16)", // Amber soft
    iconTextColor: "#fbbf24",
  },
  {
    id: "notif-12",
    category: "mention",
    dateGroup: "earlier",
    title: "Instructor mentioned you in Q&A",
    body: 'Instructor mentioned you in "Why does TypeScript require explicit return types".',
    timestamp: "May 4, 3:15 PM",
    isRead: true,
    iconType: "at",
    iconColor: "rgba(168, 85, 247, 0.16)",
    iconTextColor: "#c084fc",
    authorName: "Instructor",
    authorAvatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80",
    actionUrl: "/discussions",
  },
  {
    id: "notif-13",
    category: "mention",
    dateGroup: "earlier",
    title: "Priya Sharma mentioned you",
    body: 'Priya Sharma mentioned you in "PostgreSQL query optimization tips".',
    timestamp: "May 3, 11:20 AM",
    isRead: true,
    iconType: "at",
    iconColor: "rgba(168, 85, 247, 0.16)",
    iconTextColor: "#c084fc",
    authorName: "Priya Sharma",
    authorAvatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80",
    actionUrl: "/discussions",
  },
];

export const initialRecentMentions: readonly RecentMentionItem[] = [
  {
    id: "mention-1",
    authorName: "Anurag Singh",
    authorAvatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    timestamp: "18 min ago",
    context: 'mentioned you in "Understanding mapped types with modifiers"',
  },
  {
    id: "mention-2",
    authorName: "Instructor",
    authorAvatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80",
    timestamp: "2h ago",
    context:
      'mentioned you in "Why does TypeScript require explicit return types"',
  },
  {
    id: "mention-3",
    authorName: "Priya Sharma",
    authorAvatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80",
    timestamp: "1d ago",
    context: 'mentioned you in "PostgreSQL query optimization tips"',
  },
];
