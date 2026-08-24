export interface AcademyTheme {
  id: string;
  name: string;
  note: string;
  preview: string;
  darkInk: boolean;
}

export const academyThemes: readonly AcademyTheme[] = [
  {
    id: "codex",
    name: "Veo Onyx",
    note: "Default - charcoal & soft white",
    preview: "#f4f4f5",
    darkInk: true,
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    note: "Clear & confident",
    preview: "#7193ff",
    darkInk: true,
  },
  {
    id: "midnight",
    name: "Midnight Azure",
    note: "Deep blue & luminous",
    preview: "#4166d4",
    darkInk: false,
  },
  {
    id: "graphite",
    name: "Graphite Studio",
    note: "Graphite & violet",
    preview: "#8b68ff",
    darkInk: false,
  },
  {
    id: "violet",
    name: "Copper Slate",
    note: "Mineral gray & copper",
    preview: "#d6875f",
    darkInk: true,
  },
  {
    id: "ember",
    name: "Ember Orange",
    note: "Warm & focused",
    preview: "#ff8a34",
    darkInk: true,
  },
  {
    id: "sunlit",
    name: "Sunlit Yellow",
    note: "Bright & optimistic",
    preview: "#f6c945",
    darkInk: true,
  },
  {
    id: "grove",
    name: "Grove Green",
    note: "Calm & grounded",
    preview: "#4dda85",
    darkInk: true,
  },
  {
    id: "rose",
    name: "Studio Rose",
    note: "Expressive & warm",
    preview: "#fb6f92",
    darkInk: true,
  },
  {
    id: "signal",
    name: "Signal Red",
    note: "Crisp & high-impact",
    preview: "#d92d4e",
    darkInk: false,
  },
  {
    id: "barbie",
    name: "Barbie Pink",
    note: "Bright & iconic",
    preview: "#ec4d9b",
    darkInk: true,
  },
  {
    id: "aurora",
    name: "Aurora Teal",
    note: "Cool & luminous",
    preview: "#28d8c6",
    darkInk: true,
  },
  {
    id: "brainwave",
    name: "Brainwave Slate",
    note: "Cool graphite & electric blue",
    preview: "#0085ff",
    darkInk: true,
  },
  {
    id: "lilac",
    name: "Velvet Lilac",
    note: "Plum depth & soft lavender",
    preview: "#c18cff",
    darkInk: true,
  },
  {
    id: "champagne",
    name: "Champagne Noir",
    note: "Soft black & champagne gold",
    preview: "#e6c98a",
    darkInk: true,
  },
  {
    id: "lime",
    name: "Electric Lime",
    note: "Graphite & vivid chartreuse",
    preview: "#a3e635",
    darkInk: true,
  },
];

export interface ThemeRotationPreferences {
  enabled: boolean;
  pool: string[];
}

export const DEFAULT_ACADEMY_THEME = "codex";
export const ACADEMY_THEME_VERSION = "veo-onyx-default-v2";

const THEME_KEY = "veolms-academy-theme";
const THEME_VERSION_KEY = "veolms-academy-theme-version";
const ROTATION_ENABLED_KEY = "veolms-randomize-academy-theme";
const ROTATION_POOL_KEY = "veolms-random-academy-theme-pool";
const SESSION_THEME_KEY = "veolms-session-academy-theme";
const paletteIds = new Set<string>(academyThemes.map((theme) => theme.id));
const allThemeIds = academyThemes.map((theme) => theme.id);

function normalizeThemePool(value: unknown): string[] {
  if (!Array.isArray(value)) return [...allThemeIds];

  const pool = value.filter(
    (themeId, index): themeId is string =>
      typeof themeId === "string" &&
      paletteIds.has(themeId) &&
      value.indexOf(themeId) === index,
  );
  return pool.length >= 2 ? pool : [...allThemeIds];
}

export function getThemeRotationPreferences(): ThemeRotationPreferences {
  if (typeof window === "undefined") {
    return { enabled: false, pool: [...allThemeIds] };
  }

  let storedPool: unknown;
  try {
    storedPool = JSON.parse(
      window.localStorage.getItem(ROTATION_POOL_KEY) || "null",
    );
  } catch {
    storedPool = null;
  }

  return {
    enabled: window.localStorage.getItem(ROTATION_ENABLED_KEY) === "true",
    pool: normalizeThemePool(storedPool),
  };
}

export function persistThemeRotationPreferences(
  preferences: ThemeRotationPreferences,
): ThemeRotationPreferences {
  const normalized = {
    enabled: preferences.enabled,
    pool: normalizeThemePool(preferences.pool),
  };
  if (typeof window === "undefined") return normalized;

  const previousEnabled =
    window.localStorage.getItem(ROTATION_ENABLED_KEY) === "true";
  const previousPool = window.localStorage.getItem(ROTATION_POOL_KEY);
  const nextPool = JSON.stringify(normalized.pool);

  window.localStorage.setItem(ROTATION_ENABLED_KEY, String(normalized.enabled));
  window.localStorage.setItem(ROTATION_POOL_KEY, nextPool);

  if (!normalized.enabled) {
    window.sessionStorage.removeItem(SESSION_THEME_KEY);
  } else if (
    previousEnabled !== normalized.enabled ||
    previousPool !== nextPool
  ) {
    const sessionTheme = window.sessionStorage.getItem(SESSION_THEME_KEY);
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    const savedVersion = window.localStorage.getItem(THEME_VERSION_KEY);
    const currentTheme =
      sessionTheme && paletteIds.has(sessionTheme)
        ? sessionTheme
        : savedVersion === ACADEMY_THEME_VERSION &&
            savedTheme &&
            paletteIds.has(savedTheme)
          ? savedTheme
          : DEFAULT_ACADEMY_THEME;
    window.sessionStorage.setItem(SESSION_THEME_KEY, currentTheme);
  }

  return normalized;
}

export function pickRandomAcademyTheme(
  pool: readonly string[],
  currentTheme: string,
  random: () => number = Math.random,
): string {
  const normalizedPool = normalizeThemePool(pool);
  const candidates =
    normalizedPool.length > 1
      ? normalizedPool.filter((themeId) => themeId !== currentTheme)
      : normalizedPool;
  const selectionPool = candidates.length > 0 ? candidates : normalizedPool;
  const index = Math.min(
    selectionPool.length - 1,
    Math.floor(Math.max(0, random()) * selectionPool.length),
  );
  return selectionPool[index] || DEFAULT_ACADEMY_THEME;
}

export function getInitialAcademyTheme(): string {
  if (typeof window === "undefined") return DEFAULT_ACADEMY_THEME;

  const savedVersion = window.localStorage.getItem(THEME_VERSION_KEY);
  const savedTheme = window.localStorage.getItem(THEME_KEY);
  const currentTheme =
    savedVersion === ACADEMY_THEME_VERSION &&
    savedTheme !== null &&
    paletteIds.has(savedTheme)
      ? savedTheme
      : DEFAULT_ACADEMY_THEME;
  const rotation = getThemeRotationPreferences();

  if (!rotation.enabled) {
    window.sessionStorage.removeItem(SESSION_THEME_KEY);
    return currentTheme;
  }

  const sessionTheme = window.sessionStorage.getItem(SESSION_THEME_KEY);
  if (sessionTheme && paletteIds.has(sessionTheme)) return sessionTheme;

  const nextTheme = pickRandomAcademyTheme(rotation.pool, currentTheme);
  window.sessionStorage.setItem(SESSION_THEME_KEY, nextTheme);
  return nextTheme;
}

export function persistAcademyTheme(theme: string): void {
  if (typeof window === "undefined" || !paletteIds.has(theme)) return;
  window.localStorage.setItem(THEME_KEY, theme);
  window.localStorage.setItem(THEME_VERSION_KEY, ACADEMY_THEME_VERSION);

  if (getThemeRotationPreferences().enabled) {
    window.sessionStorage.setItem(SESSION_THEME_KEY, theme);
  }
}
