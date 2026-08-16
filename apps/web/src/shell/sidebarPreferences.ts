import {
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  SIDEBAR_DOCK_DEFAULT_ITEMS,
  SIDEBAR_DOCK_DEFAULT_ORDER,
} from "../settings/settingsPreferences";
import type {
  SidebarDockItem,
  SidebarPreferences,
} from "../settings/settingsPreferences";

export const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 300;
const SIDEBAR_MAX_WIDTH_LIMIT = 520;
const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MAX_WIDTH_DEFAULT_VERSION = "300px-v1";
const SIDEBAR_ICON_DEFAULT_VERSION = "monochrome-theme-v1";
const SIDEBAR_DOCK_DEFAULT_VERSION = "four-controls-v1";

export const clampSidebarMaxWidth = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(
        SIDEBAR_MAX_WIDTH_LIMIT,
        Math.max(SIDEBAR_MIN_WIDTH, numericValue),
      )
    : SIDEBAR_MAX_WIDTH;
};

export const clampSidebarWidth = (
  value: number | string,
  maxWidth: unknown = SIDEBAR_MAX_WIDTH,
): number =>
  Math.min(
    clampSidebarMaxWidth(maxWidth),
    Math.max(SIDEBAR_MIN_WIDTH, Number(value)),
  );

export const getInitialSidebarWidth = (): number => {
  const rawSavedWidth = localStorage.getItem("veolms-sidebar-width");
  if (rawSavedWidth === null || rawSavedWidth.trim() === "") {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  const savedWidth = Number(rawSavedWidth);
  return Number.isFinite(savedWidth)
    ? clampSidebarWidth(savedWidth)
    : SIDEBAR_DEFAULT_WIDTH;
};

export const getInitialSidebarPreferences = (): SidebarPreferences => {
  const fallback: SidebarPreferences = {
    iconStyle: "monochrome",
    monochromeMode: "theme",
    monochromeColor: "#6c78ff",
    contentLayout: "framed",
    sidebarMaxWidth: SIDEBAR_MAX_WIDTH,
    headerLayout: "fixed",
    dockItems: [...SIDEBAR_DOCK_DEFAULT_ITEMS],
    dockOrder: [...SIDEBAR_DOCK_DEFAULT_ORDER],
    showKeyboardShortcuts: true,
    showCollapsedLabels: true,
    showCollapsedLogo: true,
    highlightActive: true,
    elevateMenus: false,
  };
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem("veolms-sidebar-preferences") || "{}",
    );
    const storedPreferences =
      saved && typeof saved === "object"
        ? (saved as Record<string, unknown>)
        : {};
    const preferences = {
      ...fallback,
      ...storedPreferences,
    } as SidebarPreferences;
    preferences.headerLayout =
      storedPreferences.headerLayout === "inline" ? "inline" : "fixed";
    preferences.elevateMenus =
      storedPreferences.elevateMenus === true ||
      (storedPreferences.elevateMenus === undefined &&
        storedPreferences.alwaysElevateMenus === true);
    delete preferences.alwaysElevateMenus;
    const legacyDockItems: SidebarDockItem[] =
      storedPreferences.dockItems === undefined &&
      storedPreferences.showThemeIcon === false
        ? ["appearance", "fullscreen"]
        : normalizeSidebarDockItems(storedPreferences.dockItems);
    const hasCurrentDockDefault =
      localStorage.getItem("veolms-sidebar-dock-default-version") ===
      SIDEBAR_DOCK_DEFAULT_VERSION;
    const usedPreviousDefault =
      storedPreferences.dockItems === undefined ||
      JSON.stringify(storedPreferences.dockItems) ===
        JSON.stringify(["appearance", "theme", "fullscreen"]);
    preferences.dockItems =
      !hasCurrentDockDefault &&
      usedPreviousDefault &&
      storedPreferences.showThemeIcon !== false
        ? [...SIDEBAR_DOCK_DEFAULT_ITEMS]
        : legacyDockItems;
    preferences.dockOrder =
      !hasCurrentDockDefault && usedPreviousDefault
        ? [...SIDEBAR_DOCK_DEFAULT_ORDER]
        : normalizeSidebarDockOrder(
            storedPreferences.dockOrder ?? storedPreferences.dockItems,
          );
    const needsStructureMigration =
      storedPreferences.headerLayout !== preferences.headerLayout ||
      JSON.stringify(storedPreferences.dockItems) !==
        JSON.stringify(preferences.dockItems) ||
      JSON.stringify(storedPreferences.dockOrder) !==
        JSON.stringify(preferences.dockOrder) ||
      Object.prototype.hasOwnProperty.call(
        storedPreferences,
        "showThemeIcon",
      ) ||
      Object.prototype.hasOwnProperty.call(
        storedPreferences,
        "alwaysElevateMenus",
      );
    delete preferences.showThemeIcon;
    const hasCurrentMaxWidthDefault =
      localStorage.getItem("veolms-sidebar-max-width-default-version") ===
      SIDEBAR_MAX_WIDTH_DEFAULT_VERSION;

    const needsMaxWidthMigration = !hasCurrentMaxWidthDefault;
    if (needsMaxWidthMigration) {
      preferences.sidebarMaxWidth = SIDEBAR_MAX_WIDTH;
    }

    const hasCurrentIconDefault =
      localStorage.getItem("veolms-sidebar-icon-default-version") ===
      SIDEBAR_ICON_DEFAULT_VERSION;
    const needsIconMigration = !hasCurrentIconDefault;
    if (needsIconMigration) {
      preferences.iconStyle = "monochrome";
      preferences.monochromeMode = "theme";
    }

    if (
      needsMaxWidthMigration ||
      needsIconMigration ||
      needsStructureMigration ||
      !hasCurrentDockDefault
    ) {
      localStorage.setItem(
        "veolms-sidebar-preferences",
        JSON.stringify(preferences),
      );

      if (needsMaxWidthMigration) {
        localStorage.setItem(
          "veolms-sidebar-max-width-default-version",
          SIDEBAR_MAX_WIDTH_DEFAULT_VERSION,
        );
      }

      if (needsIconMigration) {
        localStorage.setItem(
          "veolms-sidebar-icon-default-version",
          SIDEBAR_ICON_DEFAULT_VERSION,
        );
      }

      if (!hasCurrentDockDefault) {
        localStorage.setItem(
          "veolms-sidebar-dock-default-version",
          SIDEBAR_DOCK_DEFAULT_VERSION,
        );
      }
    }

    return preferences;
  } catch {
    return fallback;
  }
};
