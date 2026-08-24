import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SidebarSettings } from "../../src/settings/SidebarSettings";
import type { SidebarPreferences } from "../../src/settings/settingsPreferences";

const preferences: SidebarPreferences = {
  iconStyle: "monochrome",
  monochromeMode: "custom",
  monochromeColor: "#123456",
  sidebarMaxWidth: 300,
};

const renderSettings = (onChange: (next: SidebarPreferences) => void) =>
  render(
    <SidebarSettings
      sidebarPreferences={preferences}
      onSidebarPreferencesChange={onChange}
      academyTheme="veo-onyx"
      sidebarMode="expanded"
    />,
  );

function StatefulSidebarSettings() {
  const [state, setState] = useState<SidebarPreferences>({
    ...preferences,
    headerLayout: "inline",
    dockItems: ["appearance", "reading-mode", "fullscreen"],
    dockOrder: [
      "appearance",
      "theme",
      "reading-mode",
      "fullscreen",
      "settings",
    ],
  });
  return (
    <SidebarSettings
      sidebarPreferences={state}
      onSidebarPreferencesChange={setState}
      academyTheme="veo-onyx"
      sidebarMode="expanded"
    />
  );
}

describe("sidebar settings draft inputs", () => {
  it("uses the shared themed slider for sidebar width", () => {
    renderSettings(vi.fn());
    const slider = screen.getByRole("slider", { name: "Sidebar max width" });

    expect(slider).toHaveClass("app-slider", "app-slider--accent");
    expect(slider).toHaveAttribute("aria-valuetext", "300 pixels");
    expect(slider.getAttribute("style")).toContain(
      "--app-slider-progress: 26.666666666666668%",
    );
  });

  it("commits a normalized width only on blur or Enter", () => {
    const onChange = vi.fn();
    renderSettings(onChange);
    const input = screen.getByRole("spinbutton", {
      name: "Sidebar max width in pixels",
    });

    fireEvent.change(input, { target: { value: "420" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      sidebarMaxWidth: 420,
    });

    onChange.mockClear();
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      sidebarMaxWidth: 520,
    });
    expect(input).toHaveValue(520);
  });

  it("keeps invalid hex drafts local and only persists complete colors", () => {
    const onChange = vi.fn();
    renderSettings(onChange);
    const input = screen.getByRole("textbox", {
      name: "Custom monochrome icon color hex value",
    });

    fireEvent.change(input, { target: { value: "#123" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("#123");
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "#abcdef" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      monochromeMode: "custom",
      monochromeColor: "#abcdef",
    });
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("separates header, menu, and draggable dock settings", () => {
    render(<StatefulSidebarSettings />);

    expect(
      screen.getByRole("heading", { name: "Sidebar header" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Sidebar menus" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sidebar dock" })).toBeVisible();

    const fixedHeader = screen.getByRole("switch", {
      name: "Fixed collapse control",
    });
    expect(fixedHeader).toHaveAttribute("aria-checked", "false");
    fireEvent.click(
      fixedHeader
        .closest(".settings-row")!
        .querySelector(".settings-row__copy")!,
    );
    expect(fixedHeader).toHaveAttribute("aria-checked", "true");
    fireEvent.click(fixedHeader);
    expect(fixedHeader).toHaveAttribute("aria-checked", "false");

    const keyboardShortcuts = screen.getByRole("switch", {
      name: "Show keyboard shortcuts",
    });
    expect(keyboardShortcuts).toHaveAttribute("aria-checked", "true");
    fireEvent.click(keyboardShortcuts);
    expect(keyboardShortcuts).toHaveAttribute("aria-checked", "false");

    const sidebarDepth = screen.getByRole("switch", {
      name: "Elevate sidebar menus",
    });
    expect(sidebarDepth).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sidebarDepth);
    expect(sidebarDepth).toHaveAttribute("aria-checked", "true");

    const readingMode = screen.getByRole("switch", {
      name: "Show Reading mode in sidebar dock",
    });
    expect(readingMode).toBeEnabled();
    expect(readingMode).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("3 visible")).toBeVisible();

    expect(
      screen.getByRole("switch", {
        name: "Show Light / dark mode in sidebar dock",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", {
        name: "Show Color theme in sidebar dock",
      }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", {
        name: "Show Fullscreen in sidebar dock",
      }),
    ).toHaveAttribute("aria-checked", "true");

    const reorderHandles = screen.getAllByRole("button", {
      name: /^Reorder /,
    });
    expect(
      reorderHandles.map((handle) => handle.getAttribute("aria-label")),
    ).toEqual([
      "Reorder Light / dark mode",
      "Reorder Color theme",
      "Reorder Reading mode",
      "Reorder Fullscreen",
      "Reorder Settings",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Reorder Reading mode" }),
    );
    expect(readingMode).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Reorder Fullscreen" }),
      { key: "Home" },
    );
    expect(
      screen
        .getAllByRole("button", { name: /^Reorder / })
        .map((handle) => handle.getAttribute("aria-label")),
    ).toEqual([
      "Reorder Fullscreen",
      "Reorder Light / dark mode",
      "Reorder Color theme",
      "Reorder Reading mode",
      "Reorder Settings",
    ]);

    const settings = screen.getByRole("switch", {
      name: "Show Settings in sidebar dock",
    });
    expect(settings).toHaveAttribute("aria-checked", "false");
    fireEvent.click(settings);
    expect(settings).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("4 visible")).toBeVisible();

    fireEvent.click(
      readingMode
        .closest(".settings-row")!
        .querySelector(".settings-row__copy")!,
    );
    expect(readingMode).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("3 visible")).toBeVisible();
  });
});
