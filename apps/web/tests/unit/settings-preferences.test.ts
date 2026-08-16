import { describe, expect, it } from "vitest";
import {
  ELEVATED_SURFACES_KEY,
  getSurfaceDepthBootstrapScript,
  LEARNING_PREFERENCE_DEFAULTS,
  LEARNING_PREFERENCES_KEY,
  normalizePageTabColors,
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  normalizeSidebarMaxWidth,
  PAGE_TAB_COLORS_DEFAULT,
  PAGE_TAB_COLORS_KEY,
  readLearningPreferences,
  readElevatedSurfaces,
  readPageTabColors,
} from "../../src/settings/settingsPreferences.js";

describe("surface depth preference", () => {
  it("defaults to enabled and respects an explicit stored opt-out", () => {
    expect(readElevatedSurfaces()).toBe(true);

    localStorage.setItem(ELEVATED_SURFACES_KEY, "false");
    expect(readElevatedSurfaces()).toBe(false);

    localStorage.setItem(ELEVATED_SURFACES_KEY, "true");
    expect(readElevatedSurfaces()).toBe(true);
  });
});

describe("page tab color preferences", () => {
  it("hydrates tab and sidebar color modes before React mounts", () => {
    localStorage.setItem(PAGE_TAB_COLORS_KEY, "multicolor");
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ iconStyle: "multicolor", elevateMenus: true }),
    );

    window.eval(getSurfaceDepthBootstrapScript());

    expect(document.documentElement.dataset.pageTabColors).toBe("multicolor");
    expect(document.documentElement.dataset.sidebarIconStyle).toBe(
      "multicolor",
    );
    expect(document.documentElement.dataset.sidebarMenuElevation).toBe("true");
  });

  it("defaults missing and unsupported values to following the sidebar", () => {
    expect(readPageTabColors()).toBe(PAGE_TAB_COLORS_DEFAULT);
    expect(normalizePageTabColors("unsupported")).toBe("follow-sidebar");
    expect(normalizePageTabColors(null)).toBe("follow-sidebar");
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
  it("defaults to the four appearance controls in the requested order", () => {
    expect(normalizeSidebarDockItems(undefined)).toEqual([
      "appearance",
      "theme",
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
