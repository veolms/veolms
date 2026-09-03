import type { NotificationPreferencesResponse } from "@veolms/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationPreferences: NotificationPreferencesResponse = {
  preferences: [
    {
      notificationType: "course.published",
      channel: "in_app",
      enabled: false,
    },
    {
      notificationType: "course.published",
      channel: "email",
      enabled: false,
    },
    {
      notificationType: "video.processing_completed",
      channel: "in_app",
      enabled: false,
    },
    {
      notificationType: "video.processing_completed",
      channel: "email",
      enabled: false,
    },
    {
      notificationType: "video.processing_failed",
      channel: "in_app",
      enabled: false,
    },
    {
      notificationType: "video.processing_failed",
      channel: "email",
      enabled: false,
    },
  ],
};

const serviceMocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("../../src/services/notifications", () => ({
  useNotificationPreferences: () => ({
    data: notificationPreferences,
    isPending: false,
  }),
  useUpdateNotificationPreferences: () => ({
    isError: false,
    isPending: false,
    mutate: serviceMocks.update,
  }),
}));

import { NotificationSettings } from "../../src/settings/NotificationSettings";

describe("NotificationSettings", () => {
  beforeEach(() => serviceMocks.update.mockReset());

  it("keeps delivery enabled when only course updates are disabled", () => {
    render(<NotificationSettings />);

    expect(
      screen.getByRole("switch", { name: "Course updates" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", { name: "In-app notifications" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "Email notifications" }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("switch", { name: "Course updates" }));

    expect(serviceMocks.update).toHaveBeenCalledWith({
      preferences: [
        {
          notificationType: "course.published",
          channel: "in_app",
          enabled: true,
        },
        {
          notificationType: "course.published",
          channel: "email",
          enabled: true,
        },
        {
          notificationType: "video.processing_completed",
          channel: "in_app",
          enabled: true,
        },
        {
          notificationType: "video.processing_completed",
          channel: "email",
          enabled: true,
        },
        {
          notificationType: "video.processing_failed",
          channel: "in_app",
          enabled: true,
        },
        {
          notificationType: "video.processing_failed",
          channel: "email",
          enabled: true,
        },
      ],
    });
  });

  it("disables preference controls while signed out", () => {
    render(<NotificationSettings isAuthenticated={false} />);

    for (const label of [
      "In-app notifications",
      "Email notifications",
      "Course updates",
      "Discussion replies",
      "Learning reminders",
      "Milestones and achievements",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toBeDisabled();
    }

    fireEvent.click(screen.getByRole("switch", { name: "Course updates" }));
    expect(serviceMocks.update).not.toHaveBeenCalled();
  });
});
