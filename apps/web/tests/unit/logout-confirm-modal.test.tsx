import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { LogoutConfirmModal } from "../../src/shell/LogoutConfirmModal";

function TestWrapper({
  onConfirm = () => undefined,
}: {
  onConfirm?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open logout
      </button>
      <LogoutConfirmModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={onConfirm}
      />
    </div>
  );
}

describe("LogoutConfirmModal", () => {
  it("asks for confirmation and does not sign out when cancelled", async () => {
    const onConfirm = vi.fn();
    render(<TestWrapper onConfirm={onConfirm} />);

    const trigger = screen.getByRole("button", { name: "Open logout" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Sign out?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ends your session on this device/i),
    ).toBeInTheDocument();

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Stay signed in" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("confirms sign out from the primary action", () => {
    const onConfirm = vi.fn();
    render(<TestWrapper onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Open logout" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and blocks dismiss while signing out", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <LogoutConfirmModal
        isOpen
        isPending
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Signing out…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stay signed in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();

    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Sign out?" })).toBeInTheDocument();
  });
});
