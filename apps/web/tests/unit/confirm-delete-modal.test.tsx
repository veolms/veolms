import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDeleteModal } from "../../src/ConfirmDeleteModal";

function TestWrapper() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button type="button" id="trigger-btn" onClick={() => setIsOpen(true)}>
        Open Modal
      </button>
      <ConfirmDeleteModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={() => setIsOpen(false)}
      />
    </div>
  );
}

describe("ConfirmDeleteModal", () => {
  it("traps Tab focus among close, cancel, and confirm buttons and restores focus on close", async () => {
    render(<TestWrapper />);

    const triggerBtn = screen.getByRole("button", { name: "Open Modal" });
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    fireEvent.click(triggerBtn);

    const closeBtn = screen.getByRole("button", { name: "Close dialog" });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    const confirmBtn = screen.getByRole("button", { name: /Hold to Delete/i });

    // Wait for initial focus timeout
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(confirmBtn);
    });

    // Tab forward from confirm button (last focusable) wraps to close button (first focusable)
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab backward from close button (first focusable) wraps to confirm button (last focusable)
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirmBtn);

    // Tab from close button to cancel button
    closeBtn.focus();
    cancelBtn.focus();
    expect(document.activeElement).toBe(cancelBtn);

    // Escape closes modal and restores focus to trigger button
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(triggerBtn);
  });
});
