import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollbarSettings } from "../../src/settings/scrollbars/ScrollbarSettings.tsx";

describe("scrollbar appearance settings", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("veolms-hide-scrollbars", "false");
    delete document.documentElement.dataset.hideScrollbars;
    delete document.documentElement.dataset.scrollbarStyle;
  });

  it("persists a selected style and applies it to the document", async () => {
    render(<ScrollbarSettings />);

    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Show scrollbars" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    fireEvent.click(screen.getByRole("radio", { name: /Thick/i }));

    await waitFor(() => {
      expect(document.documentElement.dataset.scrollbarStyle).toBe("thick");
    });
    expect(localStorage.getItem("veolms-scrollbar-style")).toBe("thick");
  });

  it("hides every style control when scrollbars are turned off", async () => {
    render(<ScrollbarSettings />);

    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Show scrollbars" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Show scrollbars" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.hideScrollbars).toBe("true");
    });
    expect(localStorage.getItem("veolms-hide-scrollbars")).toBe("true");
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    for (const style of ["Default", "Custom", "Theme", "Thick"]) {
      expect(
        screen.getByRole("radio", { name: new RegExp(style, "i") }),
      ).toBeDisabled();
    }
  });

  it("keeps current-session attributes when storage writes are blocked", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage denied", "SecurityError");
      });

    expect(() => render(<ScrollbarSettings />)).not.toThrow();
    expect(document.documentElement.dataset.scrollbarStyle).toBeTruthy();
    setItem.mockRestore();
  });
});
