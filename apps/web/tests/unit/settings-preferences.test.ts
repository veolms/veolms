import { describe, expect, it } from "vitest";
import {
  CONTROL_RADIUS_CUSTOM_KEY,
  CONTROL_RADIUS_DEFAULT,
  CONTROL_RADIUS_KEY,
  ELEVATED_SURFACES_KEY,
  applySidebarGlowShapeSize,
  getControlRadiusBootstrapScript,
  getScrollbarBootstrapScript,
  getSurfaceDepthBootstrapScript,
  LEARNING_PREFERENCE_DEFAULTS,
  LEARNING_PREFERENCES_KEY,
  normalizeControlRadiusCustom,
  normalizeControlRadiusPreset,
  normalizePageTabColors,
  normalizeScrollbarStyle,
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  normalizeSidebarMaxWidth,
  normalizeSidebarGlowShapeSize,
  PAGE_TAB_COLORS_DEFAULT,
  PAGE_TAB_COLORS_KEY,
  persistControlRadiusPreference,
  readControlRadiusPreference,
  readLearningPreferences,
  readElevatedSurfaces,
  readPageTabColors,
  readScrollbarStyle,
  SCROLLBAR_STYLE_DEFAULT,
  SCROLLBAR_STYLE_KEY,
} from "../../src/settings/settingsPreferences.js";

const runSurfaceDepthBootstrap = () => {
  // biome-ignore lint/security/noGlobalEval: Execute the generated inline bootstrap in JSDOM.
  window.eval(getSurfaceDepthBootstrapScript());
};

const runControlRadiusBootstrap = () => {
  // biome-ignore lint/security/noGlobalEval: Execute the generated inline bootstrap in JSDOM.
  window.eval(getControlRadiusBootstrapScript());
};

const runScrollbarBootstrap = () => {
  // biome-ignore lint/security/noGlobalEval: Execute the generated inline bootstrap in JSDOM.
  window.eval(getScrollbarBootstrapScript());
};

describe("scrollbar style preference", () => {
  it("uses the themed default and normalizes unsupported values", () => {
    expect(readScrollbarStyle()).toBe(SCROLLBAR_STYLE_DEFAULT);
    expect(normalizeScrollbarStyle("custom")).toBe("custom");
    expect(normalizeScrollbarStyle("unsupported")).toBe(
      SCROLLBAR_STYLE_DEFAULT,
    );
  });

  it("hydrates visibility and style before React mounts", () => {
    localStorage.setItem("veolms-hide-scrollbars", "true");
    localStorage.setItem(SCROLLBAR_STYLE_KEY, "thick");

    runScrollbarBootstrap();

    expect(document.documentElement.dataset.hideScrollbars).toBe("true");
    expect(document.documentElement.dataset.scrollbarStyle).toBe("thick");
  });

  it("falls back to theme when the stored style is unsupported", () => {
    localStorage.setItem(SCROLLBAR_STYLE_KEY, "unsupported");

    runScrollbarBootstrap();

    expect(document.documentElement.dataset.scrollbarStyle).toBe("theme");
  });
});

describe("control radius preference", () => {
  it("uses the balanced default and clamps custom pixel values", () => {
    expect(readControlRadiusPreference()).toEqual(CONTROL_RADIUS_DEFAULT);
    expect(normalizeControlRadiusPreset("unsupported")).toBe("balanced");
    expect(normalizeControlRadiusCustom(-4)).toBe(0);
    expect(normalizeControlRadiusCustom(19.6)).toBe(20);
    expect(normalizeControlRadiusCustom(100)).toBe(64);
  });

  it("persists a custom radius and applies it to the document root", () => {
    persistControlRadiusPreference({ preset: "custom", customPx: 18 });

    expect(localStorage.getItem(CONTROL_RADIUS_KEY)).toBe("custom");
    expect(localStorage.getItem(CONTROL_RADIUS_CUSTOM_KEY)).toBe("18");
    expect(document.documentElement.dataset.controlRadius).toBe("custom");
    expect(
      document.documentElement.style.getPropertyValue("--control-radius"),
    ).toBe("18px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--control-radius-structured",
      ),
    ).toBe("14px");
  });

  it("hydrates the selected preset before React mounts", () => {
    localStorage.setItem(CONTROL_RADIUS_KEY, "pill");
    localStorage.setItem(CONTROL_RADIUS_CUSTOM_KEY, "22");

    runControlRadiusBootstrap();

    expect(document.documentElement.dataset.controlRadius).toBe("pill");
    expect(
      document.documentElement.style.getPropertyValue("--control-radius"),
    ).toBe("999px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--control-radius-structured",
      ),
    ).toBe("14px");
  });
});

describe("surface depth preference", () => {
  it("defaults to enabled and respects an explicit stored opt-out", () => {
    expect(readElevatedSurfaces()).toBe(true);

    localStorage.setItem(ELEVATED_SURFACES_KEY, "false");
    expect(readElevatedSurfaces()).toBe(false);

    localStorage.setItem(ELEVATED_SURFACES_KEY, "true");
    expect(readElevatedSurfaces()).toBe(true);
  });

  it("hydrates sidebar menu elevation on by default and preserves opt-out", () => {
    runSurfaceDepthBootstrap();
    expect(document.documentElement.dataset.sidebarMenuElevation).toBe("true");

    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ elevateMenus: false }),
    );
    runSurfaceDepthBootstrap();
    expect(document.documentElement.dataset.sidebarMenuElevation).toBe("false");
  });

  it("hydrates and applies the sidebar glow shape scale before React mounts", () => {
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ glowShapeSize: 150 }),
    );

    runSurfaceDepthBootstrap();

    expect(normalizeSidebarGlowShapeSize(150)).toBe(150);
    expect(
      document.documentElement.style.getPropertyValue(
        "--sidebar-glow-field-width",
      ),
    ).toBe("1080.00px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--sidebar-bokeh-top-size",
      ),
    ).toBe("177.00px");

    expect(applySidebarGlowShapeSize(50)).toBe(50);
    expect(
      document.documentElement.style.getPropertyValue(
        "--sidebar-bokeh-top-size",
      ),
    ).toBe("59.00px");
  });
});

describe("page tab color preferences", () => {
  it("hydrates tab and sidebar color modes before React mounts", () => {
    localStorage.setItem(PAGE_TAB_COLORS_KEY, "multicolor");
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        iconStyle: "multicolor",
        elevateMenus: true,
        contentLayout: "edge-to-edge",
      }),
    );

    runSurfaceDepthBootstrap();

    expect(document.documentElement.dataset.pageTabColors).toBe("multicolor");
    expect(document.documentElement.dataset.sidebarIconStyle).toBe(
      "multicolor",
    );
    expect(document.documentElement.dataset.sidebarMenuElevation).toBe("true");
    expect(document.documentElement.dataset.contentLayout).toBe("edge-to-edge");
    expect(document.documentElement.dataset.sidebarHeaderLayout).toBe("inline");
  });

  it("defaults missing and unsupported values to following the sidebar", () => {
    expect(readPageTabColors()).toBe(PAGE_TAB_COLORS_DEFAULT);
    expect(normalizePageTabColors("unsupported")).toBe("follow-sidebar");
    expect(normalizePageTabColors(null)).toBe("follow-sidebar");
  });

  it("preserves an explicitly fixed header without a version marker", () => {
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ headerLayout: "fixed" }),
    );

    runSurfaceDepthBootstrap();

    expect(document.documentElement.dataset.sidebarHeaderLayout).toBe("fixed");
  });

  it.each(["follow-sidebar", "multicolor", "monochrome"] as const)(
    "accepts and reads the %s mode",
    (mode) => {
      localStorage.setItem(PAGE_TAB_COLORS_KEY, mode);
      expect(normalizePageTabColors(mode)).toBe(mode);
      expect(readPageTabColors()).toBe(mode);
    },
  );
});

describe("sidebar width preferences", () => {
  it("clamps numeric values to the supported inclusive range", () => {
    expect(normalizeSidebarMaxWidth(220)).toBe(220);
    expect(normalizeSidebarMaxWidth(420)).toBe(420);
    expect(normalizeSidebarMaxWidth(520)).toBe(520);
    expect(normalizeSidebarMaxWidth(219)).toBe(220);
    expect(normalizeSidebarMaxWidth(521)).toBe(520);
  });

  it("uses the existing default for non-numeric values", () => {
    expect(normalizeSidebarMaxWidth("not-a-width")).toBe(300);
    expect(normalizeSidebarMaxWidth(Infinity)).toBe(300);
  });
});

describe("sidebar dock preferences", () => {
  it("defaults to mode, reading, and fullscreen controls", () => {
    expect(normalizeSidebarDockItems(undefined)).toEqual([
      "appearance",
      "reading-mode",
      "fullscreen",
    ]);
  });

  it("deduplicates, validates, and supports the optional Settings control", () => {
    expect(
      normalizeSidebarDockItems([
        "reading-mode",
        "appearance",
        "reading-mode",
        "unsupported",
        "fullscreen",
        "theme",
        "settings",
      ]),
    ).toEqual([
      "reading-mode",
      "appearance",
      "fullscreen",
      "theme",
      "settings",
    ]);
  });

  it("normalizes a custom order and appends any missing controls", () => {
    expect(
      normalizeSidebarDockOrder([
        "fullscreen",
        "appearance",
        "fullscreen",
        "unsupported",
      ]),
    ).toEqual([
      "fullscreen",
      "appearance",
      "theme",
      "reading-mode",
      "settings",
    ]);
  });
});

describe("learning preference persistence", () => {
  it("uses defaults when no stored preference exists", () => {
    expect(readLearningPreferences()).toEqual(LEARNING_PREFERENCE_DEFAULTS);
  });

  it("merges valid stored preferences while retaining supported defaults", () => {
    localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({
        videoQuality: "1080",
        reminderDays: ["sat", "sun"],
      }),
    );

    expect(readLearningPreferences()).toEqual({
      ...LEARNING_PREFERENCE_DEFAULTS,
      videoQuality: "1080",
      reminderDays: ["sat", "sun"],
    });
  });

  it("returns the existing default object for invalid JSON", () => {
    localStorage.setItem(LEARNING_PREFERENCES_KEY, "{");

    expect(readLearningPreferences()).toBe(LEARNING_PREFERENCE_DEFAULTS);
  });

  it("removes the retired autoplay preference from stored settings", () => {
    localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({ autoplayNextLecture: true }),
    );

    expect(readLearningPreferences()).not.toHaveProperty("autoplayNextLecture");
  });

  it("falls back to default reminder days when stored days are not an array", () => {
    localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({
        reminderDays: "weekdays",
      }),
    );

    expect(readLearningPreferences()).toEqual({
      ...LEARNING_PREFERENCE_DEFAULTS,
      reminderDays: LEARNING_PREFERENCE_DEFAULTS.reminderDays,
    });
  });
});
