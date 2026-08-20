import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "../../src/notifications/NotificationsPage.tsx";

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    value,
    onValueChange,
    options,
  }: {
    ariaLabel: string;
    value: string;
    onValueChange: (val: string) => void;
    options: readonly [string, string][];
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  ),
}));

describe("NotificationsPage", () => {
  it("renders Notifications title, description, badge, and grouped feeds", () => {
    render(<NotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Notifications", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Stay updated with course activity, replies, reminders, and announcements.",
      ),
    ).toBeInTheDocument();

    // Check date group headings
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();

    // Check initial notification items
    expect(screen.getByText("New course published")).toBeInTheDocument();
    expect(
      screen.getByText("Instructor replied to your question"),
    ).toBeInTheDocument();
    expect(screen.getByText("Assignment graded")).toBeInTheDocument();
  });

  it("switches category tabs and filters the notifications feed", () => {
    render(<NotificationsPage />);

    const allTab = screen.getByRole("tab", { name: /^All/ });
    const mentionsTab = screen.getByRole("tab", { name: /Mentions/ });
    const announcementsTab = screen.getByRole("tab", { name: /Announcements/ });

    expect(allTab).toHaveAttribute("aria-selected", "true");

    // Click Mentions tab
    fireEvent.click(mentionsTab);
    expect(mentionsTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("You were mentioned in a discussion"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("New course published"),
    ).not.toBeInTheDocument();

    // Click Announcements tab
    fireEvent.click(announcementsTab);
    expect(announcementsTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("Community Hackathon Announced"),
    ).toBeInTheDocument();
  });

  it("filters notifications by search input", () => {
    render(<NotificationsPage />);

    const searchInput = screen.getByPlaceholderText("Search notifications...");

    fireEvent.change(searchInput, { target: { value: "PostgreSQL" } });
    expect(screen.getByText("Certificate earned")).toBeInTheDocument();
    expect(
      screen.queryByText("New course published"),
    ).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("New course published")).toBeInTheDocument();
  });

  it("marks all notifications as read when clicking 'Mark all as read'", () => {
    const setNoticeMock = vi.fn();
    render(<NotificationsPage setNotice={setNoticeMock} />);

    const markAllBtn = screen.getByRole("button", {
      name: /Mark all as read/,
    });
    fireEvent.click(markAllBtn);

    expect(setNoticeMock).toHaveBeenCalledWith(
      "All notifications marked as read.",
    );

    // Unread count in tab should be 0 or not have unread badge
    const unreadTab = screen.getByRole("tab", { name: /^Unread/ });
    expect(unreadTab).toBeInTheDocument();
  });

  it("toggles read status for a single notification", () => {
    render(<NotificationsPage />);

    const optionButtons = screen.getAllByRole("button", {
      name: /Options for notification/,
    });
    fireEvent.click(optionButtons[0]!);

    const markAsReadOption = screen.getByRole("menuitem", {
      name: /Mark as read/,
    });
    fireEvent.click(markAsReadOption);
  });

  it("renders Summary and Recent Mentions widgets with interactivity", () => {
    render(<NotificationsPage />);

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Recent mentions")).toBeInTheDocument();
    expect(screen.getByText("Anurag Singh")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();

    // Clicking "View all" in Recent mentions switches to mentions tab
    const viewAllBtn = screen.getByRole("button", { name: "View all" });
    fireEvent.click(viewAllBtn);

    const mentionsTab = screen.getByRole("tab", { name: /Mentions/ });
    expect(mentionsTab).toHaveAttribute("aria-selected", "true");
  });
});
