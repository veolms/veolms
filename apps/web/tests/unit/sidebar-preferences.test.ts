import { afterEach, describe, expect, it } from "vitest";
import {
  clampSidebarMaxWidth,
  clampSidebarWidth,
  getInitialSidebarPreferences,
  getInitialSidebarShellState,
  getInitialSidebarWidth,
  getSidebarPresentationBootstrapScript,
  getSidebarShellBootstrapScript,
} from "../../src/shell/sidebarPreferences.js";
import {
  normalizeSidebarGlowBlur,
  normalizeSidebarGlowIntensity,
  normalizeSidebarGlowShape,
  normalizeSidebarGlowShapeSize,
  SIDEBAR_GLOW_INTENSITY_DEFAULT,
} from "../../src/settings/settingsPreferences.js";

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
  showSidebarOnMobile: false,
  glowPalette: "theme",
  glowShape: "circle",
  glowShapeSize: 100,
  glowBlur: 8,
  glowIntensity: SIDEBAR_GLOW_INTENSITY_DEFAULT,
  highlightActive: true,
  elevateMenus: true,
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

describe("sidebar shell bootstrap", () => {
  afterEach(() => {
    delete window.__VEO_BOOTSTRAP__;
    delete document.documentElement.dataset.sidebarState;
    delete document.documentElement.dataset.navigationLayout;
    delete document.documentElement.dataset.collapsedTooltips;
    delete document.documentElement.dataset.collapsedSidebarLogo;
    delete document.documentElement.dataset.activeFill;
    delete document.documentElement.dataset.sidebarMonochromeMode;
    document.documentElement.style.removeProperty("--sidebar-width");
    document.documentElement.style.removeProperty("--sidebar-expanded-width");
    document.documentElement.style.removeProperty("--sidebar-monochrome-color");
    document.querySelector("[data-sidebar-bootstrap-test]")?.remove();
  });

  it("publishes collapsed-rail presentation before the shell is painted", () => {
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({
        highlightActive: false,
        monochromeColor: "#123456",
        monochromeMode: "custom",
        showCollapsedLabels: false,
        showCollapsedLogo: false,
      }),
    );

    new Function(getSidebarPresentationBootstrapScript())();

    expect(document.documentElement.dataset.collapsedTooltips).toBe("false");
    expect(document.documentElement.dataset.collapsedSidebarLogo).toBe("false");
    expect(document.documentElement.dataset.activeFill).toBe("false");
    expect(document.documentElement.dataset.sidebarMonochromeMode).toBe(
      "custom",
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--sidebar-monochrome-color",
      ),
    ).toBe("#123456");
  });

  it("publishes persisted geometry before React initializes", () => {
    localStorage.setItem("veolms-sidebar-mode", "collapsed");
    localStorage.setItem("veolms-sidebar-width", "384");
    localStorage.setItem(
      "veolms-sidebar-max-width-default-version",
      "300px-v1",
    );
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ sidebarMaxWidth: 420 }),
    );
    const app = document.createElement("div");
    app.className = "courses-app courses-app--hidden";
    app.dataset.sidebarBootstrapTest = "";
    document.body.append(app);

    new Function(getSidebarShellBootstrapScript())();

    expect(window.__VEO_BOOTSTRAP__).toEqual({
      sidebar: { mode: "collapsed", width: 384 },
      navigation: { compact: true },
    });
    expect(document.documentElement.dataset.sidebarState).toBe("collapsed");
    expect(document.documentElement.dataset.navigationLayout).toBe("compact");
    expect(
      document.documentElement.style.getPropertyValue("--sidebar-width"),
    ).toBe("384px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--sidebar-expanded-width",
      ),
    ).toBe("384px");
    expect(app).toHaveClass("courses-app--collapsed");
    expect(app).not.toHaveClass("courses-app--hidden");
    app.remove();
  });

  it("initializes React state from the bootstrap snapshot, not storage", () => {
    localStorage.setItem("veolms-sidebar-mode", "expanded");
    localStorage.setItem("veolms-sidebar-width", "300");
    window.__VEO_BOOTSTRAP__ = {
      sidebar: { mode: "hidden", width: 412 },
    };

    expect(getInitialSidebarShellState()).toEqual({
      mode: "hidden",
      width: 412,
    });
  });
});

describe("sidebar glow intensity", () => {
  it("normalizes the full 0 to 100 range", () => {
    expect(normalizeSidebarGlowIntensity(0)).toBe(0);
    expect(normalizeSidebarGlowIntensity(42.4)).toBe(42);
    expect(normalizeSidebarGlowIntensity(100)).toBe(100);
    expect(normalizeSidebarGlowIntensity(-20)).toBe(0);
    expect(normalizeSidebarGlowIntensity(140)).toBe(100);
    expect(normalizeSidebarGlowIntensity("invalid")).toBe(
      SIDEBAR_GLOW_INTENSITY_DEFAULT,
    );
  });
});

describe("sidebar bokeh blur", () => {
  it("supports a fully clear backdrop and clamps the upper range", () => {
    expect(normalizeSidebarGlowBlur(0)).toBe(0);
    expect(normalizeSidebarGlowBlur(8)).toBe(8);
    expect(normalizeSidebarGlowBlur(20.4)).toBe(20);
    expect(normalizeSidebarGlowBlur(32)).toBe(32);
    expect(normalizeSidebarGlowBlur(-20)).toBe(0);
    expect(normalizeSidebarGlowBlur(80)).toBe(32);
    expect(normalizeSidebarGlowBlur("invalid")).toBe(8);
  });
});

describe("sidebar glow shape", () => {
  it("accepts supported shapes and falls back to a circle", () => {
    expect(normalizeSidebarGlowShape("circle")).toBe("circle");
    expect(normalizeSidebarGlowShape("triangle")).toBe("triangle");
    expect(normalizeSidebarGlowShape("star")).toBe("star");
    expect(normalizeSidebarGlowShape("diamond")).toBe("diamond");
    expect(normalizeSidebarGlowShape("hexagon")).toBe("hexagon");
    expect(normalizeSidebarGlowShape("square")).toBe("circle");
    expect(normalizeSidebarGlowShape(undefined)).toBe("circle");
  });
});

describe("sidebar glow shape size", () => {
  it("uses a 100 percent default and clamps the adjustable scale", () => {
    expect(normalizeSidebarGlowShapeSize(50)).toBe(50);
    expect(normalizeSidebarGlowShapeSize(100)).toBe(100);
    expect(normalizeSidebarGlowShapeSize(180)).toBe(180);
    expect(normalizeSidebarGlowShapeSize(20)).toBe(50);
    expect(normalizeSidebarGlowShapeSize(220)).toBe(180);
    expect(normalizeSidebarGlowShapeSize("invalid")).toBe(100);
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

  it.each([true, false])(
    "migrates the legacy always-elevate preference without changing %s",
    (legacyValue) => {
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
        JSON.stringify({ alwaysElevateMenus: legacyValue }),
      );

      const migratedPreferences = getInitialSidebarPreferences();
      expect(migratedPreferences.elevateMenus).toBe(legacyValue);
      expect(migratedPreferences).not.toHaveProperty("alwaysElevateMenus");
      expect(
        JSON.parse(
          localStorage.getItem("veolms-sidebar-preferences") ?? "null",
        ),
      ).toEqual(migratedPreferences);
    },
  );

  it("preserves an explicit opt-out from the new default", () => {
    localStorage.setItem(
      "veolms-sidebar-preferences",
      JSON.stringify({ elevateMenus: false }),
    );

    expect(getInitialSidebarPreferences().elevateMenus).toBe(false);
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
