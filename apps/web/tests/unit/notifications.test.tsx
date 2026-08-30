import type { Notification } from "@veolms/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  archive: vi.fn(),
  refetch: vi.fn(),
  feedOverride: { isError: false, isLoading: false } as {
    isError: boolean;
    isLoading: boolean;
  },
}));

function isoDaysAgo(days: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const notifications: Notification[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    type: "course.published",
    category: "learning",
    title: "New course published",
    body: "Advanced TypeScript Mastery is now available.",
    deepLink: "/courses/advanced-typescript",
    readAt: null,
    createdAt: isoDaysAgo(0, 10),
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    type: "comment.replied",
    category: "social",
    title: "Instructor replied to your question",
    body: "A new reply is waiting in your discussion.",
    deepLink: "/discussions",
    readAt: null,
    createdAt: isoDaysAgo(0, 9),
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    type: "assignment.graded",
    category: "learning",
    title: "Assignment graded",
    body: "Your React project has been graded.",
    deepLink: null,
    readAt: null,
    createdAt: isoDaysAgo(0, 8),
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    type: "user.mentioned",
    category: "social",
    title: "Anurag Singh mentioned you",
    body: "Understanding mapped types with modifiers",
    deepLink: "/discussions",
    readAt: null,
    createdAt: isoDaysAgo(1, 18),
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    type: "certificate.generated",
    category: "learning",
    title: "Certificate earned",
    body: "Your PostgreSQL Mastery certificate is ready.",
    deepLink: "/certificates/1",
    readAt: isoDaysAgo(2, 17),
    createdAt: isoDaysAgo(2, 17),
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    type: "system.announcement",
    category: "system",
    title: "Community Hackathon Announced",
    body: "Submissions open soon.",
    deepLink: null,
    readAt: null,
    createdAt: isoDaysAgo(3, 10),
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    type: "user.mentioned",
    category: "social",
    title: "Priya Sharma mentioned you",
    body: "PostgreSQL query optimization tips",
    deepLink: "/discussions",
    readAt: isoDaysAgo(4, 11),
    createdAt: isoDaysAgo(4, 11),
  },
];

vi.mock("../../src/services/notifications", () => ({
  useNotifications: (filters: {
    type?: string;
    category?: string;
    unread?: boolean;
    search?: string;
    limit?: number;
  }) => {
    let items = [...notifications];
    if (filters.type)
      items = items.filter((item) => item.type === filters.type);
    if (filters.category) {
      items = items.filter((item) => item.category === filters.category);
    }
    if (filters.unread === true) items = items.filter((item) => !item.readAt);
    if (filters.unread === false) items = items.filter((item) => item.readAt);
    if (filters.search) {
      const search = filters.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(search) ||
          item.body.toLowerCase().includes(search),
      );
    }
    items = items.slice(0, filters.limit ?? 25);
    return {
      data: serviceMocks.feedOverride.isError
        ? undefined
        : { pages: [{ items, nextCursor: null }] },
      isPending: serviceMocks.feedOverride.isLoading,
      isError: serviceMocks.feedOverride.isError,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: serviceMocks.refetch,
    };
  },
  useNotificationSummary: () => ({
    data: {
      totalCount: notifications.length,
      unreadCount: notifications.filter((item) => !item.readAt).length,
      mentionCount: notifications.filter(
        (item) => item.type === "user.mentioned",
      ).length,
      learningCount: notifications.filter(
        (item) => item.category === "learning",
      ).length,
      announcementCount: notifications.filter(
        (item) => item.type === "system.announcement",
      ).length,
    },
  }),
  useMarkNotificationRead: () => ({ mutate: serviceMocks.markRead }),
  useMarkAllNotificationsRead: () => ({
    mutate: (_value: undefined, options?: { onSuccess?: () => void }) => {
      serviceMocks.markAllRead();
      options?.onSuccess?.();
    },
  }),
  useArchiveNotification: () => ({ mutate: serviceMocks.archive }),
}));

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    value,
    onValueChange,
    options,
  }: {
    ariaLabel: string;
    value: string;
    onValueChange: (value: string) => void;
    options: readonly [string, string][];
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  ),
}));

import { NotificationsPage } from "../../src/notifications/NotificationsPage.tsx";

describe("NotificationsPage", () => {
  beforeEach(() => {
    serviceMocks.markRead.mockReset();
    serviceMocks.markAllRead.mockReset();
    serviceMocks.archive.mockReset();
    serviceMocks.refetch.mockReset();
    serviceMocks.feedOverride.isError = false;
    serviceMocks.feedOverride.isLoading = false;
  });

  it("renders the server-backed grouped feed", () => {
    render(<NotificationsPage />);
    expect(
      screen.getByRole("heading", { name: "Notifications", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    expect(screen.getByText("New course published")).toBeInTheDocument();
    expect(
      screen.getByText("Instructor replied to your question"),
    ).toBeInTheDocument();
    expect(screen.getByText("Assignment graded")).toBeInTheDocument();
  });

  it("switches category tabs and filters through query inputs", () => {
    render(<NotificationsPage />);
    const mentionsTab = screen.getByRole("tab", { name: /Mentions/ });
    fireEvent.click(mentionsTab);
    expect(mentionsTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("Anurag Singh mentioned you").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("New course published")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Announcements/ }));
    expect(
      screen.getByText("Community Hackathon Announced"),
    ).toBeInTheDocument();
  });

  it("filters notifications by search input", async () => {
    render(<NotificationsPage />);
    fireEvent.change(screen.getByPlaceholderText("Search notifications..."), {
      target: { value: "PostgreSQL" },
    });
    await waitFor(() =>
      expect(screen.getByText("Certificate earned")).toBeInTheDocument(),
    );
    expect(screen.queryByText("New course published")).not.toBeInTheDocument();
  });

  it("marks all notifications as read through the mutation", () => {
    const setNotice = vi.fn();
    render(<NotificationsPage setNotice={setNotice} />);
    fireEvent.click(screen.getByRole("button", { name: /Mark all as read/ }));
    expect(serviceMocks.markAllRead).toHaveBeenCalledOnce();
    expect(setNotice).toHaveBeenCalledWith("All notifications marked as read.");
  });

  it("marks one notification as read through the mutation", () => {
    render(<NotificationsPage />);
    fireEvent.click(
      screen.getAllByRole("button", { name: /Options for notification/ })[0]!,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as read" }));
    expect(serviceMocks.markRead).toHaveBeenCalledWith(notifications[0]!.id);
  });

  it("renders summary and recent mentions from backend data", () => {
    render(<NotificationsPage />);
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Recent mentions")).toBeInTheDocument();
    expect(
      screen.getAllByText("Anurag Singh mentioned you").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Priya Sharma mentioned you").length,
    ).toBeGreaterThan(0);
  });

  it("renders premium error card and triggers refetch on Try again click", () => {
    serviceMocks.feedOverride.isError = true;
    render(<NotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Unable to load notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Notifications could not be loaded. Please check your connection and try again.",
      ),
    ).toBeInTheDocument();

    const tryAgainButton = screen.getByRole("button", { name: "Try again" });
    expect(tryAgainButton).toBeInTheDocument();
    fireEvent.click(tryAgainButton);
    expect(serviceMocks.refetch).toHaveBeenCalledOnce();
  });
});
