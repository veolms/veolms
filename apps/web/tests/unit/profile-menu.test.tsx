import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileMenu, ShellProfileAvatar } from "../../src/shell/ProfileMenu";

describe("ShellProfileAvatar", () => {
  it("shows the avatar image when a photo is available", () => {
    render(<ShellProfileAvatar avatarUrl="/assets/sofia-avatar-160.webp" />);

    expect(document.querySelector(".shell-profile-avatar img")).toHaveAttribute(
      "src",
      "/assets/sofia-avatar-160.webp",
    );
  });

  it("shows a user icon when no photo is available", () => {
    render(<ShellProfileAvatar avatarUrl={null} />);

    expect(document.querySelector(".shell-profile-avatar img")).toBeNull();
    expect(document.querySelector(".shell-profile-avatar svg")).not.toBeNull();
  });
});

describe("ProfileMenu", () => {
  it("hides workspace switching when the user only has a student role", () => {
    render(
      <ProfileMenu
        role="student"
        allowedRoles={["student"]}
        onClose={vi.fn()}
        onRoleChange={vi.fn()}
        onToggleSidebar={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.queryByText("Workspace")).toBeNull();
    expect(screen.queryByText("Preview workspace as")).toBeNull();
    expect(screen.queryByRole("menuitemradio", { name: "Student" })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Hide sidebar" }),
    ).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeVisible();
  });

  it("offers workspace switching only when both roles are available", () => {
    const onRoleChange = vi.fn();
    const onClose = vi.fn();
    render(
      <ProfileMenu
        role="student"
        allowedRoles={["student", "creator"]}
        onClose={onClose}
        onRoleChange={onRoleChange}
        onToggleSidebar={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByText("Preview workspace as")).toBeVisible();
    expect(
      screen.getByRole("menuitemradio", { name: "Student" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Creator" }));
    expect(onRoleChange).toHaveBeenCalledWith("creator");
    expect(onClose).toHaveBeenCalled();
  });
});
