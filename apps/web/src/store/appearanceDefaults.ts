import {
  DEFAULT_PLATFORM_APPEARANCE_SETTINGS,
  PLATFORM_DISPLAY_MODES,
  type PlatformAppearanceSettings,
  type PlatformDisplayMode,
} from "@veolms/contracts/platform-settings-defaults";

/**
 * The academy's default look (Platform > Appearance): the light/dark mode and
 * colour theme a visitor sees until they pick their own in Settings.
 *
 * The page's head decides the look before anything is drawn, so it cannot
 * wait for the API. It uses the defaults this browser last heard from the API
 * (kept here), or, on a first visit, the ones the build was made with. Once
 * the API answers, the shell applies any newer default to a visitor who has
 * not picked their own (see usePlatformAppearanceDefaults).
 *
 * Whether a visitor picked their own is kept apart from the value itself,
 * because the shell writes the mode and theme it shows to storage on every
 * visit: "user" once they choose something other than the default,
 * "default" while they follow it.
 */

/** The defaults this browser last heard from the API. */
export const PLATFORM_APPEARANCE_STORAGE_KEY = "veolms-platform-appearance";
export const DISPLAY_MODE_STORAGE_KEY = "veolms-theme";
export const DISPLAY_MODE_CHOICE_KEY = "veolms-theme-choice";
export const COLOR_THEME_CHOICE_KEY = "veolms-academy-theme-choice";
/**
 * The mode that applied before an academy could set one. A stored mode other
 * than this one, from before choices were recorded, was the visitor's own.
 */
const LEGACY_DEFAULT_DISPLAY_MODE: PlatformDisplayMode = "dark";

type AppearanceChoice = "user" | "default";

const isDisplayMode = (value: unknown): value is PlatformDisplayMode =>
  typeof value === "string" &&
  (PLATFORM_DISPLAY_MODES as readonly string[]).includes(value);

const isThemeId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value);

function normalizeAppearance(
  value: unknown,
): PlatformAppearanceSettings | null {
  if (!value || typeof value !== "object") return null;
  const { defaultDisplayMode, defaultColorTheme } = value as Record<
    string,
    unknown
  >;
  return {
    defaultDisplayMode: isDisplayMode(defaultDisplayMode)
      ? defaultDisplayMode
      : DEFAULT_PLATFORM_APPEARANCE_SETTINGS.defaultDisplayMode,
    defaultColorTheme: isThemeId(defaultColorTheme)
      ? defaultColorTheme
      : DEFAULT_PLATFORM_APPEARANCE_SETTINGS.defaultColorTheme,
  };
}

/** What the build API answered while this version was built, if anything. */
const BUILD_APPEARANCE =
  normalizeAppearance(import.meta.env.VEO_PLATFORM_APPEARANCE) ??
  DEFAULT_PLATFORM_APPEARANCE_SETTINGS;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

/** The academy's defaults as this browser knows them. */
export function readPlatformAppearance(): PlatformAppearanceSettings {
  if (typeof window === "undefined") return BUILD_APPEARANCE;
  try {
    return (
      normalizeAppearance(
        JSON.parse(readStorage(PLATFORM_APPEARANCE_STORAGE_KEY) || "null"),
      ) ?? BUILD_APPEARANCE
    );
  } catch {
    return BUILD_APPEARANCE;
  }
}

export function rememberPlatformAppearance(
  appearance: PlatformAppearanceSettings,
) {
  writeStorage(PLATFORM_APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
}

/**
 * Normally written by the head script on the first visit after choices
 * started being recorded; worked out the same way here for a browser where
 * that script could not write.
 */
function readDisplayModeChoice(): AppearanceChoice {
  const choice = readStorage(DISPLAY_MODE_CHOICE_KEY);
  if (choice === "user" || choice === "default") return choice;
  const stored = readStorage(DISPLAY_MODE_STORAGE_KEY);
  return isDisplayMode(stored) && stored !== LEGACY_DEFAULT_DISPLAY_MODE
    ? "user"
    : "default";
}

/** Whether the visitor still follows the academy's light/dark default. */
export function followsDefaultDisplayMode(): boolean {
  return readDisplayModeChoice() === "default";
}

/** The mode to show: the visitor's own, or the academy's default. */
export function readInitialDisplayMode(): PlatformDisplayMode {
  const stored = readStorage(DISPLAY_MODE_STORAGE_KEY);
  return readDisplayModeChoice() === "user" && isDisplayMode(stored)
    ? stored
    : readPlatformAppearance().defaultDisplayMode;
}

/**
 * Saves the mode on screen. One that differs from the academy's default can
 * only be the visitor's own pick, and is kept as theirs from then on.
 */
export function persistDisplayMode(mode: PlatformDisplayMode) {
  writeStorage(DISPLAY_MODE_STORAGE_KEY, mode);
  if (mode !== readPlatformAppearance().defaultDisplayMode) {
    writeStorage(DISPLAY_MODE_CHOICE_KEY, "user");
  }
}

/**
 * Whether the visitor still follows the academy's colour theme. `legacyOwn`
 * says whether a theme saved before choices were recorded was their own.
 */
export function followsDefaultColorTheme(legacyOwn: () => boolean): boolean {
  const choice = readStorage(COLOR_THEME_CHOICE_KEY);
  if (choice === "user" || choice === "default") return choice === "default";
  return !legacyOwn();
}

/** Same rule as persistDisplayMode, for the colour theme. */
export function recordColorThemeShown(themeId: string) {
  if (themeId !== readPlatformAppearance().defaultColorTheme) {
    writeStorage(COLOR_THEME_CHOICE_KEY, "user");
  }
}

/**
 * The head script that sets `data-theme` and `data-palette` before the first
 * paint, by the rules above. On the first visit after choices started being
 * recorded it also records them: a stored mode other than dark, or a current
 * stored theme other than the first one, was the visitor's own.
 */
export function getAppearanceBootstrapScript({
  themeIds,
  firstThemeId,
  themeVersion,
}: {
  themeIds: readonly string[];
  firstThemeId: string;
  themeVersion: string;
}) {
  const modes = JSON.stringify(PLATFORM_DISPLAY_MODES);
  return `(()=>{const r=document.documentElement,p=${JSON.stringify(themeIds)},m=${modes},L=localStorage;let a=null;try{a=JSON.parse(L.getItem(${JSON.stringify(PLATFORM_APPEARANCE_STORAGE_KEY)})||"null")}catch{}a=a&&typeof a==="object"?a:{};const dm=m.includes(a.defaultDisplayMode)?a.defaultDisplayMode:${JSON.stringify(BUILD_APPEARANCE.defaultDisplayMode)},dt=p.includes(a.defaultColorTheme)?a.defaultColorTheme:p.includes(${JSON.stringify(BUILD_APPEARANCE.defaultColorTheme)})?${JSON.stringify(BUILD_APPEARANCE.defaultColorTheme)}:${JSON.stringify(firstThemeId)};try{const s=L.getItem(${JSON.stringify(DISPLAY_MODE_STORAGE_KEY)});let c=L.getItem(${JSON.stringify(DISPLAY_MODE_CHOICE_KEY)});if(c!=="user"&&c!=="default"){c=m.includes(s)&&s!==${JSON.stringify(LEGACY_DEFAULT_DISPLAY_MODE)}?"user":"default";L.setItem(${JSON.stringify(DISPLAY_MODE_CHOICE_KEY)},c)}const t=c==="user"&&m.includes(s)?s:dm;r.dataset.theme=t==="device"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t==="light"?"light":"dark"}catch{}try{const e=L.getItem("veolms-randomize-academy-theme")==="true",s=sessionStorage.getItem("veolms-session-academy-theme"),l=L.getItem("veolms-academy-theme"),v=L.getItem("veolms-academy-theme-version")===${JSON.stringify(themeVersion)}&&p.includes(l||"");let k=L.getItem(${JSON.stringify(COLOR_THEME_CHOICE_KEY)});if(k!=="user"&&k!=="default"){k=v&&l!==${JSON.stringify(firstThemeId)}?"user":"default";L.setItem(${JSON.stringify(COLOR_THEME_CHOICE_KEY)},k)}r.dataset.palette=e&&p.includes(s||"")?s:k==="user"&&v?l:dt}catch{}})();`;
}
