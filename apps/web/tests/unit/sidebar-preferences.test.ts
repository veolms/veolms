import { describe, expect, it } from "vitest";
import {
  clampSidebarMaxWidth,
  clampSidebarWidth,
  getInitialSidebarPreferences,
  getInitialSidebarWidth,
} from "../../src/shell/sidebarPreferences.js";

const defaultPreferences = {
  iconStyle: "monochrome",
  monochromeMode: "theme",
  monochromeColor: "#6c78ff",
  contentLayout: "framed",
  sidebarMaxWidth: 300,
  headerLayout: "inline",
  dockItems: ["appearance", "reading-mode", "fullscreen"],
  dockOrder: ["appearance", "theme", "reading-mode", "fullscreen", "settings"],
  showKeyboardShortcuts: true,
  showCollapsedLabels: true,
  showCollapsedLogo: true,
  highlightActive: true,
  elevateMenus: false,
};

describe("sidebar width helpers", () => {
  it("preserves the current width and custom-maximum clamping rules", () => {
    expect(clampSidebarMaxWidth(219)).toBe(220);
    expect(clampSidebarMaxWidth("420")).toBe(420);
    expect(clampSidebarMaxWidth(521)).toBe(520);
    expect(clampSidebarMaxWidth("not-a-width")).toBe(300);
    expect(clampSidebarMaxWidth(Infinity)).toBe(300);

    expect(clampSidebarWidth(180, 420)).toBe(220);
    expect(clampSidebarWidth(360, 420)).toBe(360);
    expect(clampSidebarWidth(480, 420)).toBe(420);
    expect(clampSidebarWidth(480)).toBe(300);
    expect(Number.isNaN(clampSidebarWidth("not-a-width", 420))).toBe(true);
  });

  it("uses the default for missing or blank storage before parsing widths", () => {
    expect(getInitialSidebarWidth()).toBe(300);

    localStorage.setItem("veolms-sidebar-width", "   ");
    expect(getInitialSidebarWidth()).toBe(300);

    localStorage.setItem("veolms-sidebar-width", "275");
    expect(getInitialSidebarWidth()).toBe(275);

    localStorage.setItem("veolms-sidebar-width", "420");
    expect(getInitialSidebarWidth()).toBe(300);

    localStorage.setItem("veolms-sidebar-width", "invalid");
    expect(getInitialSidebarWidth()).toBe(300);
  });
});

describe("sidebar preference storage", () => {
  it("returns defaults and stamps the max-width version on first read", () => {
    expect(getInitialSidebarPreferences()).toEqual(defaultPreferences);
    expect(
      localStorage.getItem("veolms-sidebar-max-width-default-version"),
    ).toBe("300px-v1");
    expect(localStorage.getItem("veolms-sidebar-icon-default-version")).toBe(
      "monochrome-theme-v1",
    );
    expect(localStorage.getItem("veolms-sidebar-dock-default-version")).toBe(
      "three-controls-v2",
    );
    expect(localStorage.getItem("veolms-sidebar-header-default-version")).toBe(
      "inline-v1",
    );
    expect(
      JSON.parse(localStorage.getItem("veolms-sidebar-preferences") ?? "null"),
    ).toEqual(defaultPreferences);
    expect(getInitialSidebarPreferences()).toEqual(defaultPreferences);
  });

  it("resets a stored custom maximum once when the version is stale", () => {
    localStorage.setItem(
      "veolms-sidebar-max-width-default-version",
      "older-version",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        iconStyle: "monochrome",
        sidebarMaxWidth: 420,
        retainedUnknownField: true,
      }),
    );

    expect(getInitialSidebarPreferences()).toEqual({
      ...defaultPreferences,
      iconStyle: "monochrome",
      sidebarMaxWidth: 300,
      retainedUnknownField: true,
    });
    expect(
      localStorage.getItem("veolms-sidebar-max-width-default-version"),
    ).toBe("300px-v1");
    const storedPreferences = localStorage.getItem(
      "veolms-sidebar-preferences",
    );
    expect(storedPreferences).not.toBeNull();
    expect(JSON.parse(storedPreferences ?? "null")).toEqual({
      ...defaultPreferences,
      sidebarMaxWidth: 300,
      retainedUnknownField: true,
    });
    expect(getInitialSidebarPreferences()).toEqual({
      ...defaultPreferences,
      sidebarMaxWidth: 300,
      retainedUnknownField: true,
    });
  });

  it("preserves a custom maximum when the stored version is current", () => {
    localStorage.setItem(
      "veolms-sidebar-max-width-default-version",
      "300px-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        contentLayout: "full-width",
        sidebarMaxWidth: 420,
      }),
    );

    expect(getInitialSidebarPreferences()).toEqual({
      ...defaultPreferences,
      contentLayout: "full-width",
      sidebarMaxWidth: 420,
    });
  });

  it("persists icon migration before its marker, then preserves user choices", () => {
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        iconStyle: "multicolor",
        monochromeMode: "custom",
      }),
    );

    const migratedPreferences = getInitialSidebarPreferences();
    expect(migratedPreferences).toMatchObject({
      iconStyle: "monochrome",
      monochromeMode: "theme",
    });
    expect(
      JSON.parse(localStorage.getItem("veolms-sidebar-preferences") ?? "null"),
    ).toEqual(migratedPreferences);
    expect(getInitialSidebarPreferences()).toEqual(migratedPreferences);

    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ iconStyle: "multicolor" }),
    );
    expect(getInitialSidebarPreferences().iconStyle).toBe("multicolor");
  });

  it("migrates the legacy theme-icon preference into the dock selection", () => {
    localStorage.setItem(
      "veolms-sidebar-max-width-default-version",
      "300px-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-icon-default-version",
      "monochrome-theme-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        showThemeIcon: false,
        sidebarMaxWidth: 360,
      }),
    );

    const migratedPreferences = getInitialSidebarPreferences();
    expect(migratedPreferences).toEqual({
      ...defaultPreferences,
      sidebarMaxWidth: 360,
      dockItems: ["appearance", "fullscreen"],
    });
    expect(
      JSON.parse(localStorage.getItem("veolms-sidebar-preferences") ?? "null"),
    ).toEqual(migratedPreferences);
    expect(migratedPreferences).not.toHaveProperty("showThemeIcon");
  });

  it("migrates a dock only when its legacy marker confirms the old default", () => {
    localStorage.setItem(
      "veolms-sidebar-dock-default-version",
      "four-controls-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        headerLayout: "fixed",
        dockItems: ["appearance", "theme", "reading-mode", "fullscreen"],
        dockOrder: [
          "appearance",
          "theme",
          "reading-mode",
          "fullscreen",
          "settings",
        ],
      }),
    );

    const migratedPreferences = getInitialSidebarPreferences();
    expect(migratedPreferences).toMatchObject({
      headerLayout: "fixed",
      dockItems: ["appearance", "reading-mode", "fullscreen"],
    });
    expect(localStorage.getItem("veolms-sidebar-dock-default-version")).toBe(
      "three-controls-v2",
    );
    expect(localStorage.getItem("veolms-sidebar-header-default-version")).toBe(
      "inline-v1",
    );

    localStorage.removeItem("veolms-sidebar-dock-default-version");
    localStorage.removeItem("veolms-sidebar-header-default-version");
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        headerLayout: "fixed",
        dockItems: ["appearance", "theme", "reading-mode", "fullscreen"],
      }),
    );
    expect(getInitialSidebarPreferences()).toMatchObject({
      headerLayout: "fixed",
      dockItems: ["appearance", "theme", "reading-mode", "fullscreen"],
    });
  });

  it("preserves a customized legacy dock order", () => {
    const dockItems = ["appearance", "theme", "reading-mode", "fullscreen"];
    const dockOrder = [
      "reading-mode",
      "appearance",
      "theme",
      "fullscreen",
      "settings",
    ];
    localStorage.setItem(
      "veolms-sidebar-dock-default-version",
      "four-controls-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ dockItems, dockOrder }),
    );

    expect(getInitialSidebarPreferences()).toMatchObject({
      dockItems,
      dockOrder,
    });
  });

  it("migrates the legacy always-elevate preference without changing its value", () => {
    localStorage.setItem(
      "veolms-sidebar-max-width-default-version",
      "300px-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-icon-default-version",
      "monochrome-theme-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-dock-default-version",
      "four-controls-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ alwaysElevateMenus: true }),
    );

    const migratedPreferences = getInitialSidebarPreferences();
    expect(migratedPreferences.elevateMenus).toBe(true);
    expect(migratedPreferences).not.toHaveProperty("alwaysElevateMenus");
    expect(
      JSON.parse(localStorage.getItem("veolms-sidebar-preferences") ?? "null"),
    ).toEqual(migratedPreferences);
  });

  it("returns defaults for invalid JSON without stamping the migration version", () => {
    localStorage.setItem("veolms-sidebar-preferences", "{");

    expect(getInitialSidebarPreferences()).toEqual(defaultPreferences);
    expect(
      localStorage.getItem("veolms-sidebar-max-width-default-version"),
    ).toBeNull();
    expect(
      localStorage.getItem("veolms-sidebar-icon-default-version"),
    ).toBeNull();
    expect(
      localStorage.getItem("veolms-sidebar-dock-default-version"),
    ).toBeNull();
    expect(
      localStorage.getItem("veolms-sidebar-header-default-version"),
    ).toBeNull();
    expect(localStorage.getItem("veolms-sidebar-preferences")).toBe("{");
  });
});
