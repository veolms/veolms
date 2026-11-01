import { useState, type Dispatch, type SetStateAction } from "react";
import {
  clampSidebarMaxWidth,
  getDefaultSidebarPreferences,
} from "../sidebarPreferences";
import { DEFAULT_ACADEMY_THEME } from "../../themes";
import type {
  PageTabColors,
  SidebarPreferences,
  SidebarDockItem,
} from "../../settings/settingsPreferences";
import {
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  PAGE_TAB_COLORS_DEFAULT,
} from "../../settings/settingsPreferences";
import {
  READING_MODE_DEFAULTS,
  type ReadingModeColors,
} from "../../reading-mode/readingModePreferences";

export interface UseShellPreferencesStateArgs {
  compactNavigation: boolean;
  academyTheme: string;
}

export interface UseShellPreferencesStateResult {
  appliedAcademyTheme: string;
  setAppliedAcademyTheme: Dispatch<SetStateAction<string>>;
  palettePreviewTheme: string | null;
  setPalettePreviewTheme: Dispatch<SetStateAction<string | null>>;
  displayedAcademyTheme: string;
  sidebarPreferences: SidebarPreferences;
  setSidebarPreferences: Dispatch<SetStateAction<SidebarPreferences>>;
  mobileSidebarNavigationActive: boolean;
  sidebarAvailable: boolean;
  pageTabColors: PageTabColors;
  setPageTabColors: Dispatch<SetStateAction<PageTabColors>>;
  sidebarHeaderLayout: "inline";
  sidebarDockItems: SidebarDockItem[];
  settingsInSidebarDock: boolean;
  sidebarMaxWidth: number;
  showSidebarAppearanceControl: boolean;
  showSidebarThemeIcon: boolean;
  readingModePreferences: {
    enabled: boolean;
    colorTemperature: number;
    texture: number;
    textureGrainSize: number;
    colors: ReadingModeColors;
  };
  setReadingModePreferences: Dispatch<
    SetStateAction<{
      enabled: boolean;
      colorTemperature: number;
      texture: number;
      textureGrainSize: number;
      colors: ReadingModeColors;
    }>
  >;
  readingModeEnabled: boolean;
}

export function useShellPreferencesState({
  compactNavigation,
  academyTheme,
}: UseShellPreferencesStateArgs): UseShellPreferencesStateResult {
  const [appliedAcademyTheme, setAppliedAcademyTheme] = useState(
    DEFAULT_ACADEMY_THEME,
  );
  const [palettePreviewTheme, setPalettePreviewTheme] = useState<string | null>(
    null,
  );
  const displayedAcademyTheme = palettePreviewTheme ?? academyTheme;
  const [sidebarPreferences, setSidebarPreferences] = useState(
    getDefaultSidebarPreferences,
  );
  const showSidebarOnMobile = sidebarPreferences.showSidebarOnMobile === true;
  const mobileSidebarNavigationActive =
    compactNavigation && showSidebarOnMobile;
  const sidebarAvailable = !compactNavigation || mobileSidebarNavigationActive;
  const [pageTabColors, setPageTabColors] = useState<PageTabColors>(
    PAGE_TAB_COLORS_DEFAULT,
  );
  // The "fixed" header layout no longer has a setting; a stored value from
  // before is ignored.
  const sidebarHeaderLayout = "inline";
  const selectedSidebarDockItems = normalizeSidebarDockItems(
    sidebarPreferences.dockItems,
  );
  const sidebarDockItems = normalizeSidebarDockOrder(
    sidebarPreferences.dockOrder,
  ).filter((item) => selectedSidebarDockItems.includes(item));
  const settingsInSidebarDock = sidebarDockItems.includes("settings");
  const sidebarMaxWidth = clampSidebarMaxWidth(
    sidebarPreferences?.sidebarMaxWidth,
  );
  const showSidebarAppearanceControl = sidebarDockItems.includes("appearance");
  const showSidebarThemeIcon = sidebarDockItems.includes("theme");
  const [readingModePreferences, setReadingModePreferences] = useState({
    ...READING_MODE_DEFAULTS,
  });
  const readingModeEnabled = readingModePreferences.enabled;
  return {
    appliedAcademyTheme,
    setAppliedAcademyTheme,
    palettePreviewTheme,
    setPalettePreviewTheme,
    displayedAcademyTheme,
    sidebarPreferences,
    setSidebarPreferences,
    mobileSidebarNavigationActive,
    sidebarAvailable,
    pageTabColors,
    setPageTabColors,
    sidebarHeaderLayout,
    sidebarDockItems,
    settingsInSidebarDock,
    sidebarMaxWidth,
    showSidebarAppearanceControl,
    showSidebarThemeIcon,
    readingModePreferences,
    setReadingModePreferences,
    readingModeEnabled,
  };
}
