import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SidebarSettings } from "../../src/settings/SidebarSettings";
import type { SidebarPreferences } from "../../src/settings/settingsPreferences";
import type { NavigationItemWithMetadata } from "../../src/shell/navigation";

const navigationFromLabels = (
  labels: readonly string[],
): NavigationItemWithMetadata[] =>
  labels.map((label) => [label, SquaresFour]);

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

function StatefulGlowSettings() {
  const [state, setState] = useState<SidebarPreferences>({
    ...preferences,
    glowPalette: "theme",
    glowShape: "circle",
    glowShapeSize: 100,
    glowBlur: 8,
    glowIntensity: 50,
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

const creatorMenuLabels = [
  "Dashboard",
  "Courses",
  "Students",
  "Reviews",
  "Wishlist",
  "Discussions",
  "Analytics",
  "Orders",
  "Settings",
] as const;

const studentMenuLabels = [
  "Home",
  "Courses",
  "Wishlist",
  "Discussions",
  "Order History",
  "Notifications",
  "Settings",
] as const;

function StatefulCreatorSidebarSettings() {
  const navigationItems = navigationFromLabels(creatorMenuLabels);
  const [visibleItems, setVisibleItems] = useState<string[]>([
    ...creatorMenuLabels,
  ]);
  return (
    <SidebarSettings
      sidebarPreferences={preferences}
      onSidebarPreferencesChange={vi.fn()}
      academyTheme="veo-onyx"
      sidebarMode="expanded"
      role="creator"
      navigationItems={navigationItems}
      navigationVisibleItems={visibleItems}
      onNavigationVisibilityChange={setVisibleItems}
    />
  );
}

function StatefulStudentSidebarSettings() {
  const navigationItems = navigationFromLabels(studentMenuLabels);
  const [visibleItems, setVisibleItems] = useState<string[]>([
    ...studentMenuLabels,
  ]);
  return (
    <SidebarSettings
      sidebarPreferences={preferences}
      onSidebarPreferencesChange={vi.fn()}
      academyTheme="veo-onyx"
      sidebarMode="expanded"
      role="student"
      navigationItems={navigationItems}
      navigationVisibleItems={visibleItems}
      onNavigationVisibilityChange={setVisibleItems}
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

  it("updates glow intensity through the shared themed slider", () => {
    const onChange = vi.fn();
    renderSettings(onChange);
    const slider = screen.getByRole("slider", {
      name: "Sidebar glow intensity",
    });

    expect(slider).toHaveValue("50");
    expect(slider).toHaveAttribute("aria-valuetext", "50 percent");

    fireEvent.change(slider, { target: { value: "42" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      glowIntensity: 42,
    });
    expect(
      screen.queryByText("Match the active academy color theme"),
    ).not.toBeInTheDocument();
  });

  it("updates the additional bokeh blur through the shared slider", () => {
    const onChange = vi.fn();
    renderSettings(onChange);
    expect(
      screen.getByRole("heading", { name: "Bokeh blur" }),
    ).toBeInTheDocument();
    const slider = screen.getByRole("slider", {
      name: "Additional sidebar bokeh blur",
    });

    expect(slider).toHaveValue("8");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "32");
    expect(slider).toHaveAttribute("aria-valuetext", "8 pixels");

    fireEvent.change(slider, { target: { value: "27" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      glowBlur: 27,
    });
  });

  it("offers CSS bokeh shapes and updates the selected shape", () => {
    const onChange = vi.fn();
    renderSettings(onChange);

    expect(screen.getByRole("radio", { name: "Circle" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const star = screen.getByRole("radio", { name: "Star" });
    fireEvent.click(star);

    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      glowShape: "star",
    });
  });

  it("updates the sidebar glow shape size through the shared slider", () => {
    const onChange = vi.fn();
    renderSettings(onChange);
    expect(
      screen.getByRole("heading", { name: "Size" }),
    ).toBeInTheDocument();
    const slider = screen.getByRole("slider", {
      name: "Sidebar glow shape size",
    });

    expect(slider).toHaveValue("100");
    expect(slider).toHaveAttribute("min", "50");
    expect(slider).toHaveAttribute("max", "180");
    expect(slider).toHaveAttribute("aria-valuetext", "100 percent");

    fireEvent.change(slider, { target: { value: "150" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...preferences,
      glowShapeSize: 150,
    });
  });

  it("resets every sidebar glow control to the shared defaults", () => {
    const onChange = vi.fn();
    const customPreferences: SidebarPreferences = {
      ...preferences,
      glowPalette: "purple-blue",
      glowShape: "star",
      glowShapeSize: 165,
      glowBlur: 27,
      glowIntensity: 75,
    };
    render(
      <SidebarSettings
        sidebarPreferences={customPreferences}
        onSidebarPreferencesChange={onChange}
        academyTheme="veo-onyx"
        sidebarMode="expanded"
      />,
    );

    const reset = screen.getByRole("button", {
      name: "Reset sidebar glow to defaults",
    });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);

    expect(onChange).toHaveBeenLastCalledWith({
      ...customPreferences,
      glowPalette: "theme",
      glowShape: "circle",
      glowShapeSize: 100,
      glowBlur: 8,
      glowIntensity: 50,
    });
  });

  it("keeps palette previews clipped and synchronized with blur and intensity", () => {
    render(<StatefulGlowSettings />);
    const preview = screen
      .getByRole("radio", { name: "Follow theme" })
      .querySelector<HTMLElement>(".settings-sidebar-glow-option__preview")!;

    expect(preview.getAttribute("style")).toContain(
      "--settings-sidebar-preview-blur: 8px",
    );
    expect(preview.getAttribute("style")).toContain(
      "--settings-sidebar-preview-intensity: 0.5",
    );
    expect(preview).not.toHaveClass("is-clear");

    fireEvent.change(
      screen.getByRole("slider", { name: "Additional sidebar bokeh blur" }),
      { target: { value: "0" } },
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Sidebar glow intensity" }),
      { target: { value: "35" } },
    );

    expect(preview).toHaveClass("is-clear");
    expect(preview.getAttribute("style")).toContain(
      "--settings-sidebar-preview-blur: 0px",
    );
    expect(preview.getAttribute("style")).toContain(
      "--settings-sidebar-preview-intensity: 0.35",
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
    expect(sidebarDepth).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sidebarDepth);
    expect(sidebarDepth).toHaveAttribute("aria-checked", "false");

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

  it("lets creators hide existing sidebar menu items", () => {
    render(<StatefulCreatorSidebarSettings />);

    expect(screen.getByRole("heading", { name: "Menu items" })).toBeVisible();
    expect(screen.getByText("9 visible")).toBeVisible();

    const dashboard = screen.getByRole("switch", {
      name: "Show Dashboard in sidebar menu",
    });
    expect(dashboard).toHaveAttribute("aria-checked", "true");
    fireEvent.click(dashboard);

    expect(dashboard).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("8 visible")).toBeVisible();
  });

  it("lets students hide existing sidebar menu items", () => {
    render(<StatefulStudentSidebarSettings />);

    expect(screen.getByRole("heading", { name: "Menu items" })).toBeVisible();
    expect(screen.getByText("7 visible")).toBeVisible();

    const notifications = screen.getByRole("switch", {
      name: "Show Notifications in sidebar menu",
    });
    fireEvent.click(notifications);

    expect(notifications).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("6 visible")).toBeVisible();
  });
});
