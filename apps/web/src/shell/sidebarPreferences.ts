import {
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  normalizeSidebarGlow,
  normalizeSidebarGlowBlur,
  normalizeSidebarGlowShape,
  normalizeSidebarGlowShapeSize,
  normalizeSidebarGlowIntensity,
  SIDEBAR_DOCK_DEFAULT_ITEMS,
  SIDEBAR_DOCK_DEFAULT_ORDER,
  SIDEBAR_GLOW_BLUR_DEFAULT,
  SIDEBAR_GLOW_DEFAULT,
  SIDEBAR_GLOW_INTENSITY_DEFAULT,
  SIDEBAR_GLOW_SHAPE_DEFAULT,
  SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT,
  SIDEBAR_HEADER_DEFAULT_VERSION,
} from "../settings/settingsPreferences";
import type {
  SidebarDockItem,
  SidebarMode,
  SidebarPreferences,
} from "../settings/settingsPreferences";
import {
  COMPACT_NAVIGATION_QUERY,
  getResponsiveSidebarMode,
  SIDEBAR_RESPONSIVE_COLLAPSE_QUERY,
} from "./sidebarVisibility";

export const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 300;
const SIDEBAR_MAX_WIDTH_LIMIT = 520;
export const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MAX_WIDTH_DEFAULT_VERSION = "300px-v1";
const SIDEBAR_ICON_DEFAULT_VERSION = "monochrome-theme-v1";
const SIDEBAR_DOCK_DEFAULT_VERSION = "three-controls-v2";
const LEGACY_SIDEBAR_DOCK_DEFAULT_ITEMS = [
  "appearance",
  "theme",
  "reading-mode",
  "fullscreen",
];
const LEGACY_SIDEBAR_DOCK_DEFAULT_ORDER = [
  "appearance",
  "theme",
  "reading-mode",
  "fullscreen",
  "settings",
];

export interface SidebarShellState {
  mode: SidebarMode;
  width: number;
}

export interface VeoBootstrapState {
  sidebar?: SidebarShellState;
  navigation?: {
    compact: boolean;
  };
  learning?: {
    curriculumCollapsed: boolean;
    curriculumWidth: number;
  };
  player?: {
    autoplay: boolean;
    muted: boolean;
    playbackRate: number;
    volume: number;
  };
}

declare global {
  interface Window {
    __VEO_BOOTSTRAP__?: VeoBootstrapState;
  }
}

const isSidebarMode = (value: unknown): value is SidebarMode =>
  value === "expanded" || value === "collapsed" || value === "hidden";

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

export const getInitialSidebarWidth = (
  maxWidth: unknown = SIDEBAR_MAX_WIDTH,
): number => {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;

  const rawSavedWidth = localStorage.getItem("veolms-sidebar-width");
  if (rawSavedWidth === null || rawSavedWidth.trim() === "") {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  const savedWidth = Number(rawSavedWidth);
  return Number.isFinite(savedWidth)
    ? clampSidebarWidth(savedWidth, maxWidth)
    : SIDEBAR_DEFAULT_WIDTH;
};

export const getInitialSidebarMode = (): SidebarMode => {
  if (typeof window === "undefined") return "expanded";

  const storedMode = localStorage.getItem("veolms-sidebar-mode");
  if (isSidebarMode(storedMode)) return storedMode;

  const legacyCollapsed = localStorage.getItem("veolms-sidebar-collapsed");
  if (legacyCollapsed !== null) {
    return legacyCollapsed === "true" ? "collapsed" : "expanded";
  }

  return getResponsiveSidebarMode(
    "expanded",
    window.matchMedia(SIDEBAR_RESPONSIVE_COLLAPSE_QUERY).matches,
  );
};

const getStoredSidebarMaxWidth = (): number => {
  if (
    localStorage.getItem("veolms-sidebar-max-width-default-version") !==
    SIDEBAR_MAX_WIDTH_DEFAULT_VERSION
  ) {
    return SIDEBAR_MAX_WIDTH;
  }

  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem("veolms-sidebar-preferences") || "{}",
    );
    return clampSidebarMaxWidth(
      stored && typeof stored === "object"
        ? (stored as Record<string, unknown>).sidebarMaxWidth
        : SIDEBAR_MAX_WIDTH,
    );
  } catch {
    return SIDEBAR_MAX_WIDTH;
  }
};

export const getInitialSidebarShellState = (): SidebarShellState => {
  if (typeof window === "undefined") {
    return { mode: "expanded", width: SIDEBAR_DEFAULT_WIDTH };
  }

  const bootstrapState = window.__VEO_BOOTSTRAP__?.sidebar;
  if (bootstrapState && isSidebarMode(bootstrapState.mode)) {
    return {
      mode: bootstrapState.mode,
      width: clampSidebarWidth(bootstrapState.width, SIDEBAR_MAX_WIDTH_LIMIT),
    };
  }

  return {
    mode: getInitialSidebarMode(),
    width: getInitialSidebarWidth(getStoredSidebarMaxWidth()),
  };
};

export const getSidebarShellBootstrapScript = () =>
  `(()=>{const r=document.documentElement,d=${SIDEBAR_DEFAULT_WIDTH},n=${SIDEBAR_MIN_WIDTH},x=${SIDEBAR_MAX_WIDTH_LIMIT},q=matchMedia(${JSON.stringify(COMPACT_NAVIGATION_QUERY)}).matches;let m="expanded",w=d,a=${SIDEBAR_MAX_WIDTH};try{const s=localStorage.getItem("veolms-sidebar-mode"),l=localStorage.getItem("veolms-sidebar-collapsed");m=s==="expanded"||s==="collapsed"||s==="hidden"?s:l!==null?(l==="true"?"collapsed":"expanded"):(matchMedia(${JSON.stringify(SIDEBAR_RESPONSIVE_COLLAPSE_QUERY)}).matches?"collapsed":"expanded");if(localStorage.getItem("veolms-sidebar-max-width-default-version")===${JSON.stringify(SIDEBAR_MAX_WIDTH_DEFAULT_VERSION)}){const p=JSON.parse(localStorage.getItem("veolms-sidebar-preferences")||"{}"),v=Number(p&&p.sidebarMaxWidth);if(Number.isFinite(v))a=Math.min(x,Math.max(n,v))}const v=Number(localStorage.getItem("veolms-sidebar-width"));if(Number.isFinite(v)&&String(localStorage.getItem("veolms-sidebar-width")||"").trim())w=Math.min(a,Math.max(n,v))}catch{}const s={mode:m,width:w};window.__VEO_BOOTSTRAP__={sidebar:s,navigation:{compact:q}};r.dataset.sidebarState=m;r.dataset.navigationLayout=q?"compact":"wide";r.style.setProperty("--sidebar-width",w+"px");r.style.setProperty("--sidebar-expanded-width",w+"px");const c=()=>{const e=document.querySelector(".courses-app");if(!e)return false;e.classList.toggle("courses-app--collapsed",m==="collapsed");e.classList.toggle("courses-app--hidden",m==="hidden");return true};if(!c()&&document.readyState==="loading"){const o=new MutationObserver(()=>{if(c())o.disconnect()});o.observe(document,{childList:true,subtree:true});document.addEventListener("DOMContentLoaded",()=>o.disconnect(),{once:true})}})();`;

export const getSidebarPresentationBootstrapScript = () =>
  `(()=>{const r=document.documentElement;try{const p=JSON.parse(localStorage.getItem("veolms-sidebar-preferences")||"{}");r.dataset.collapsedTooltips=String(p.showCollapsedLabels!==false);r.dataset.collapsedSidebarLogo=String(p.showCollapsedLogo!==false);r.dataset.activeFill=String(p.highlightActive!==false);r.dataset.sidebarMonochromeMode=p.monochromeMode==="neutral"||p.monochromeMode==="custom"?p.monochromeMode:"theme";r.style.setProperty("--sidebar-monochrome-color",typeof p.monochromeColor==="string"&&p.monochromeColor?p.monochromeColor:"#6c78ff")}catch{r.dataset.collapsedTooltips="true";r.dataset.collapsedSidebarLogo="true";r.dataset.activeFill="true";r.dataset.sidebarMonochromeMode="theme";r.style.setProperty("--sidebar-monochrome-color","#6c78ff")}})();`;

export const getDefaultSidebarPreferences = (): SidebarPreferences => ({
  iconStyle: "monochrome",
  monochromeMode: "theme",
  monochromeColor: "#6c78ff",
  contentLayout: "framed",
  sidebarMaxWidth: SIDEBAR_MAX_WIDTH,
  headerLayout: "inline",
  dockItems: [...SIDEBAR_DOCK_DEFAULT_ITEMS],
  dockOrder: [...SIDEBAR_DOCK_DEFAULT_ORDER],
  showKeyboardShortcuts: true,
  showCollapsedLabels: true,
  showCollapsedLogo: true,
  showSidebarOnMobile: false,
  glowPalette: SIDEBAR_GLOW_DEFAULT,
  glowShape: SIDEBAR_GLOW_SHAPE_DEFAULT,
  glowShapeSize: SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT,
  glowBlur: SIDEBAR_GLOW_BLUR_DEFAULT,
  glowIntensity: SIDEBAR_GLOW_INTENSITY_DEFAULT,
  highlightActive: true,
  elevateMenus: true,
});

export const getInitialSidebarPreferences = (): SidebarPreferences => {
  const fallback = getDefaultSidebarPreferences();
  if (typeof window === "undefined") return fallback;

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
    const hasCurrentHeaderDefault =
      localStorage.getItem("veolms-sidebar-header-default-version") ===
      SIDEBAR_HEADER_DEFAULT_VERSION;
    // There was no header-layout version marker before the inline default was
    // introduced, so an existing "fixed" value cannot be distinguished from a
    // deliberate user choice. Preserve explicit values and migrate only a
    // missing preference to the new fallback.
    const needsHeaderDefaultMigration =
      !hasCurrentHeaderDefault && storedPreferences.headerLayout === undefined;
    preferences.headerLayout =
      storedPreferences.headerLayout === "fixed" ? "fixed" : "inline";
    preferences.glowPalette = normalizeSidebarGlow(
      storedPreferences.glowPalette,
    );
    preferences.glowShape = normalizeSidebarGlowShape(
      storedPreferences.glowShape,
    );
    preferences.glowShapeSize = normalizeSidebarGlowShapeSize(
      storedPreferences.glowShapeSize,
    );
    preferences.glowBlur = normalizeSidebarGlowBlur(storedPreferences.glowBlur);
    preferences.glowIntensity = normalizeSidebarGlowIntensity(
      storedPreferences.glowIntensity,
    );
    preferences.elevateMenus =
      typeof storedPreferences.elevateMenus === "boolean"
        ? storedPreferences.elevateMenus
        : typeof storedPreferences.alwaysElevateMenus === "boolean"
          ? storedPreferences.alwaysElevateMenus
          : true;
    preferences.showSidebarOnMobile =
      storedPreferences.showSidebarOnMobile === true;
    delete preferences.alwaysElevateMenus;
    const legacyDockItems: SidebarDockItem[] =
      storedPreferences.dockItems === undefined &&
      storedPreferences.showThemeIcon === false
        ? ["appearance", "fullscreen"]
        : normalizeSidebarDockItems(storedPreferences.dockItems);
    const hasCurrentDockDefault =
      localStorage.getItem("veolms-sidebar-dock-default-version") ===
      SIDEBAR_DOCK_DEFAULT_VERSION;
    const usesKnownLegacyDockDefault =
      localStorage.getItem("veolms-sidebar-dock-default-version") ===
        "four-controls-v1" &&
      JSON.stringify(storedPreferences.dockItems) ===
        JSON.stringify(LEGACY_SIDEBAR_DOCK_DEFAULT_ITEMS) &&
      JSON.stringify(storedPreferences.dockOrder) ===
        JSON.stringify(LEGACY_SIDEBAR_DOCK_DEFAULT_ORDER);
    const needsDockDefaultMigration =
      !hasCurrentDockDefault &&
      (storedPreferences.dockItems === undefined || usesKnownLegacyDockDefault);
    preferences.dockItems =
      needsDockDefaultMigration && storedPreferences.showThemeIcon !== false
        ? [...SIDEBAR_DOCK_DEFAULT_ITEMS]
        : legacyDockItems;
    preferences.dockOrder = needsDockDefaultMigration
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
      ) ||
      storedPreferences.showSidebarOnMobile !== preferences.showSidebarOnMobile;
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
      !hasCurrentDockDefault ||
      !hasCurrentHeaderDefault
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

      if (!hasCurrentHeaderDefault) {
        localStorage.setItem(
          "veolms-sidebar-header-default-version",
          SIDEBAR_HEADER_DEFAULT_VERSION,
        );
      }
    }

    return preferences;
  } catch {
    return fallback;
  }
};
