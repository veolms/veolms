export const SIDEBAR_MAX_WIDTH_MIN = 220;
export const SIDEBAR_MAX_WIDTH_DEFAULT = 300;
export const SIDEBAR_MAX_WIDTH_LIMIT = 520;

export type SidebarIconStyle = "multicolor" | "monochrome";
export type PageTabColors = "follow-sidebar" | SidebarIconStyle;
export type SidebarMonochromeMode = "theme" | "neutral" | "custom";
export type SidebarContentLayout = "framed" | "edge-to-edge";
export type SidebarMode = "expanded" | "collapsed" | "hidden";
export type SidebarHeaderLayout = "fixed" | "inline";
export type SidebarDockItem =
  "appearance" | "theme" | "fullscreen" | "reading-mode" | "settings";

export const SIDEBAR_DOCK_MAX_ITEMS = 5;
export const SIDEBAR_DOCK_DEFAULT_ORDER: readonly SidebarDockItem[] = [
  "appearance",
  "theme",
  "reading-mode",
  "fullscreen",
  "settings",
];
export const SIDEBAR_DOCK_DEFAULT_ITEMS: readonly SidebarDockItem[] = [
  "appearance",
  "theme",
  "reading-mode",
  "fullscreen",
];

export const PAGE_TAB_COLORS_KEY = "veolms-page-tab-colors";
export const PAGE_TAB_COLORS_DEFAULT: PageTabColors = "follow-sidebar";
export const ELEVATED_SURFACES_KEY = "veolms-elevated-surfaces";

export const normalizePageTabColors = (value: unknown): PageTabColors =>
  value === "multicolor" || value === "monochrome" || value === "follow-sidebar"
    ? value
    : PAGE_TAB_COLORS_DEFAULT;

const SIDEBAR_DOCK_ITEMS = new Set<SidebarDockItem>([
  "appearance",
  "theme",
  "fullscreen",
  "reading-mode",
  "settings",
]);

export const normalizeSidebarDockItems = (
  value: unknown,
): SidebarDockItem[] => {
  if (!Array.isArray(value)) return [...SIDEBAR_DOCK_DEFAULT_ITEMS];

  const items = value.filter(
    (item, index): item is SidebarDockItem =>
      typeof item === "string" &&
      SIDEBAR_DOCK_ITEMS.has(item as SidebarDockItem) &&
      value.indexOf(item) === index,
  );
  return items.slice(0, SIDEBAR_DOCK_MAX_ITEMS);
};

export const normalizeSidebarDockOrder = (
  value: unknown,
): SidebarDockItem[] => {
  const requestedOrder = Array.isArray(value) ? value : [];
  const validItems = requestedOrder.filter(
    (item, index): item is SidebarDockItem =>
      typeof item === "string" &&
      SIDEBAR_DOCK_ITEMS.has(item as SidebarDockItem) &&
      requestedOrder.indexOf(item) === index,
  );
  return [
    ...validItems,
    ...SIDEBAR_DOCK_DEFAULT_ORDER.filter((item) => !validItems.includes(item)),
  ];
};

export interface SidebarPreferences {
  iconStyle?: SidebarIconStyle;
  monochromeMode?: SidebarMonochromeMode;
  monochromeColor?: string;
  contentLayout?: SidebarContentLayout;
  sidebarMaxWidth?: number;
  headerLayout?: SidebarHeaderLayout;
  dockItems?: SidebarDockItem[];
  dockOrder?: SidebarDockItem[];
  showKeyboardShortcuts?: boolean;
  showCollapsedLabels?: boolean;
  showCollapsedLogo?: boolean;
  /** @deprecated Migrated to dockItems. */
  showThemeIcon?: boolean;
  highlightActive?: boolean;
  elevateMenus?: boolean;
  /** @deprecated Migrated to elevateMenus. */
  alwaysElevateMenus?: boolean;
}

export interface LearningPreferences {
  videoQuality: string;
  playbackSpeed: string;
  resumeFromLastPosition: boolean;
  startInTheaterMode: boolean;
  weeklyGoal: string;
  learningReminders: boolean;
  reminderDays: string[];
  reminderTime: string;
  timeZone: string;
  captionsByDefault: boolean;
  captionLanguage: string;
  autoScrollTranscript: boolean;
  highlightTranscriptLine: boolean;
  openCurrentSection: boolean;
  continueWithNextIncomplete: boolean;
  automaticallyMoveNextSection: boolean;
  keepCompletedLecturesVisible: boolean;
}

export const LEARNING_PREFERENCES_KEY = "veolms-learning-preferences";
export const LEARNING_PREFERENCE_DEFAULTS: LearningPreferences = {
  videoQuality: "auto",
  playbackSpeed: "1",
  resumeFromLastPosition: true,
  startInTheaterMode: false,
  weeklyGoal: "5",
  learningReminders: true,
  reminderDays: ["mon", "tue", "wed", "thu", "fri"],
  reminderTime: "19:00",
  timeZone: "Asia/Kolkata (IST)",
  captionsByDefault: false,
  captionLanguage: "English",
  autoScrollTranscript: true,
  highlightTranscriptLine: true,
  openCurrentSection: true,
  continueWithNextIncomplete: true,
  automaticallyMoveNextSection: true,
  keepCompletedLecturesVisible: true,
};

export const LEARNING_REMINDER_DAYS: readonly (readonly [
  day: string,
  label: string,
])[] = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

export const normalizeSidebarMaxWidth = (
  value: number | string | undefined,
): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(
        SIDEBAR_MAX_WIDTH_LIMIT,
        Math.max(SIDEBAR_MAX_WIDTH_MIN, numericValue),
      )
    : SIDEBAR_MAX_WIDTH_DEFAULT;
};

export const readStored = (key: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

export const readStoredBoolean = (key: string, fallback: boolean): boolean =>
  readStored(key, String(fallback)) === "true";

export const readElevatedSurfaces = (): boolean =>
  readStoredBoolean(ELEVATED_SURFACES_KEY, true);

export const getSurfaceDepthBootstrapScript = (): string =>
  `(()=>{const root=document.documentElement;try{root.dataset.elevatedSurfaces=localStorage.getItem(${JSON.stringify(
    ELEVATED_SURFACES_KEY,
  )})==="false"?"false":"true"}catch{}try{const pageTabs=localStorage.getItem(${JSON.stringify(
    PAGE_TAB_COLORS_KEY,
  )});root.dataset.pageTabColors=pageTabs==="multicolor"||pageTabs==="monochrome"||pageTabs==="follow-sidebar"?pageTabs:${JSON.stringify(
    PAGE_TAB_COLORS_DEFAULT,
  )}}catch{root.dataset.pageTabColors=${JSON.stringify(
    PAGE_TAB_COLORS_DEFAULT,
  )}}try{const sidebar=JSON.parse(localStorage.getItem("veolms-sidebar-preferences")||"{}");root.dataset.sidebarMenuElevation=String(sidebar.elevateMenus===true||(sidebar.elevateMenus===undefined&&sidebar.alwaysElevateMenus===true));root.dataset.sidebarIconStyle=sidebar.iconStyle==="multicolor"?"multicolor":"monochrome"}catch{root.dataset.sidebarIconStyle="monochrome"}})();`;

export const readPageTabColors = (): PageTabColors =>
  normalizePageTabColors(
    readStored(PAGE_TAB_COLORS_KEY, PAGE_TAB_COLORS_DEFAULT),
  );

export const readLearningPreferences = (): LearningPreferences => {
  try {
    const value = readStored(LEARNING_PREFERENCES_KEY, "");
    const parsedPreferences: unknown = value ? JSON.parse(value) : {};
    const storedPreferences =
      typeof parsedPreferences === "object" && parsedPreferences !== null
        ? (parsedPreferences as Partial<LearningPreferences>)
        : {};
    const preferences = {
      ...LEARNING_PREFERENCE_DEFAULTS,
      ...storedPreferences,
      reminderDays: Array.isArray(storedPreferences.reminderDays)
        ? storedPreferences.reminderDays
        : LEARNING_PREFERENCE_DEFAULTS.reminderDays,
    };
    delete (preferences as Record<string, unknown>).autoplayNextLecture;
    return preferences;
  } catch {
    return LEARNING_PREFERENCE_DEFAULTS;
  }
};
