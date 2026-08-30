export const SIDEBAR_MAX_WIDTH_MIN = 220;
export const SIDEBAR_MAX_WIDTH_DEFAULT = 300;
export const SIDEBAR_MAX_WIDTH_LIMIT = 520;

export type SidebarIconStyle = "multicolor" | "monochrome";
export type PageTabColors = "follow-sidebar" | SidebarIconStyle;
export type SidebarMonochromeMode = "theme" | "neutral" | "custom";
export type SidebarContentLayout = "framed" | "edge-to-edge";
export type SidebarMode = "expanded" | "collapsed" | "hidden";
export type SidebarHeaderLayout = "fixed" | "inline";
export const SIDEBAR_GLOW_VALUES = [
  "theme",
  "off",
  "blue-yellow",
  "green-cyan",
  "red-orange",
  "purple-blue",
  "magenta-rose",
] as const;
export type SidebarGlow = (typeof SIDEBAR_GLOW_VALUES)[number];
export const SIDEBAR_GLOW_DEFAULT: SidebarGlow = "theme";
export const SIDEBAR_GLOW_SHAPE_VALUES = [
  "circle",
  "triangle",
  "star",
  "diamond",
  "hexagon",
] as const;
export type SidebarGlowShape = (typeof SIDEBAR_GLOW_SHAPE_VALUES)[number];
export const SIDEBAR_GLOW_SHAPE_DEFAULT: SidebarGlowShape = "circle";
export const SIDEBAR_GLOW_BLUR_MIN = 0;
export const SIDEBAR_GLOW_BLUR_MAX = 32;
export const SIDEBAR_GLOW_BLUR_DEFAULT = 8;
export const SIDEBAR_GLOW_INTENSITY_MIN = 0;
export const SIDEBAR_GLOW_INTENSITY_MAX = 100;
export const SIDEBAR_GLOW_INTENSITY_DEFAULT = 50;
export const SIDEBAR_GLOW_SHAPE_SIZE_MIN = 50;
export const SIDEBAR_GLOW_SHAPE_SIZE_MAX = 180;
export const SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT = 100;

const SIDEBAR_GLOW_SHAPE_BASE_LENGTHS = [
  ["--sidebar-glow-field-width", 720],
  ["--sidebar-glow-field-top-height", 420],
  ["--sidebar-glow-field-bottom-height", 440],
  ["--sidebar-bokeh-top-size", 118],
  ["--sidebar-bokeh-top-half-size", 59],
  ["--sidebar-bokeh-center-size", 102],
  ["--sidebar-bokeh-center-half-size", 51],
  ["--sidebar-bokeh-bottom-size", 126],
  ["--sidebar-bokeh-bottom-half-size", 63],
] as const;
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
  "reading-mode",
  "fullscreen",
];

export const PAGE_TAB_COLORS_KEY = "veolms-page-tab-colors";
export const PAGE_TAB_COLORS_DEFAULT: PageTabColors = "follow-sidebar";
export const ELEVATED_SURFACES_KEY = "veolms-elevated-surfaces";
export const HIDE_SCROLLBARS_KEY = "veolms-hide-scrollbars";
export const HIDE_SCROLLBARS_DEFAULT = true;
export const SCROLLBAR_STYLE_KEY = "veolms-scrollbar-style";
export const SCROLLBAR_STYLE_VALUES = [
  "default",
  "custom",
  "theme",
  "thick",
] as const;
export type ScrollbarStyle = (typeof SCROLLBAR_STYLE_VALUES)[number];
export const SCROLLBAR_STYLE_DEFAULT: ScrollbarStyle = "theme";
export const ELASTIC_SCROLL_APPEARANCE_KEY = "veolms-elastic-scroll-appearance";
export const ELASTIC_SCROLL_APPEARANCE_VALUES = ["2d", "3d"] as const;
export type ElasticScrollAppearance =
  (typeof ELASTIC_SCROLL_APPEARANCE_VALUES)[number];
export const ELASTIC_SCROLL_APPEARANCE_DEFAULT: ElasticScrollAppearance = "2d";
export const ELASTIC_SCROLL_ICON_KEY = "veolms-elastic-scroll-icon";
export const ELASTIC_SCROLL_ICON_VALUES = [
  "arrow",
  "caret",
  "double-caret",
  "bold-arrow",
  "edge",
] as const;
export type ElasticScrollIcon = (typeof ELASTIC_SCROLL_ICON_VALUES)[number];
export const ELASTIC_SCROLL_ICON_DEFAULT: ElasticScrollIcon = "arrow";
export const ELASTIC_SCROLL_ICON_ANIMATION_KEY =
  "veolms-elastic-scroll-icon-animation";
export const ELASTIC_SCROLL_ICON_ANIMATION_DEFAULT = false;
export const ELASTIC_SCROLL_GESTURE_SIDE_VALUES = ["left", "right"] as const;
export type ElasticScrollGestureSide =
  (typeof ELASTIC_SCROLL_GESTURE_SIDE_VALUES)[number];
export const ELASTIC_SCROLL_LOCK_SIDE_KEY = "veolms-elastic-scroll-lock-side";
export const ELASTIC_SCROLL_LOCK_SIDE_DEFAULT: ElasticScrollGestureSide =
  "right";
export const ELASTIC_SCROLL_UNLOCK_SIDE_KEY =
  "veolms-elastic-scroll-unlock-side";
export const ELASTIC_SCROLL_UNLOCK_SIDE_DEFAULT: ElasticScrollGestureSide =
  "left";
export const ELASTIC_SCROLL_PREFERENCES_EVENT =
  "veolms:elastic-scroll-preferences";

export interface ElasticScrollPreferences {
  appearance: ElasticScrollAppearance;
  icon: ElasticScrollIcon;
  animateIcon: boolean;
  lockSide: ElasticScrollGestureSide;
  unlockSide: ElasticScrollGestureSide;
}

export const ELASTIC_SCROLL_PREFERENCES_DEFAULT: ElasticScrollPreferences = {
  appearance: ELASTIC_SCROLL_APPEARANCE_DEFAULT,
  icon: ELASTIC_SCROLL_ICON_DEFAULT,
  animateIcon: ELASTIC_SCROLL_ICON_ANIMATION_DEFAULT,
  lockSide: ELASTIC_SCROLL_LOCK_SIDE_DEFAULT,
  unlockSide: ELASTIC_SCROLL_UNLOCK_SIDE_DEFAULT,
};
export const CONTROL_RADIUS_KEY = "veolms-control-radius";
export const CONTROL_RADIUS_CUSTOM_KEY = "veolms-control-radius-custom";
export const SIDEBAR_HEADER_DEFAULT_VERSION = "inline-v1";

export type ControlRadiusPreset =
  "square" | "subtle" | "balanced" | "rounded" | "pill" | "custom";

export interface ControlRadiusPreference {
  preset: ControlRadiusPreset;
  customPx: number;
}

export const CONTROL_RADIUS_CUSTOM_MIN = 0;
export const CONTROL_RADIUS_CUSTOM_MAX = 64;
export const CONTROL_RADIUS_STRUCTURED_MAX = 14;
export const CONTROL_RADIUS_DEFAULT: ControlRadiusPreference = {
  preset: "balanced",
  customPx: 8,
};

export const CONTROL_RADIUS_PRESETS: readonly {
  id: Exclude<ControlRadiusPreset, "custom">;
  label: string;
  radius: number;
}[] = [
  { id: "square", label: "Square", radius: 0 },
  { id: "subtle", label: "Subtle", radius: 4 },
  { id: "balanced", label: "Balanced", radius: 8 },
  { id: "rounded", label: "Rounded", radius: 14 },
  { id: "pill", label: "Pill", radius: 999 },
];

const CONTROL_RADIUS_IDS = new Set<ControlRadiusPreset>([
  ...CONTROL_RADIUS_PRESETS.map(({ id }) => id),
  "custom",
]);

export const normalizeControlRadiusCustom = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return CONTROL_RADIUS_DEFAULT.customPx;
  return Math.min(
    CONTROL_RADIUS_CUSTOM_MAX,
    Math.max(CONTROL_RADIUS_CUSTOM_MIN, Math.round(numericValue)),
  );
};

export const normalizeControlRadiusPreset = (
  value: unknown,
): ControlRadiusPreset =>
  typeof value === "string" &&
  CONTROL_RADIUS_IDS.has(value as ControlRadiusPreset)
    ? (value as ControlRadiusPreset)
    : CONTROL_RADIUS_DEFAULT.preset;

export const resolveControlRadius = ({
  preset,
  customPx,
}: ControlRadiusPreference): number => {
  if (preset === "custom") return normalizeControlRadiusCustom(customPx);
  return (
    CONTROL_RADIUS_PRESETS.find(({ id }) => id === preset)?.radius ??
    CONTROL_RADIUS_DEFAULT.customPx
  );
};

export const normalizePageTabColors = (value: unknown): PageTabColors =>
  value === "multicolor" || value === "monochrome" || value === "follow-sidebar"
    ? value
    : PAGE_TAB_COLORS_DEFAULT;

export const normalizeSidebarGlow = (value: unknown): SidebarGlow =>
  typeof value === "string" &&
  SIDEBAR_GLOW_VALUES.includes(value as SidebarGlow)
    ? (value as SidebarGlow)
    : SIDEBAR_GLOW_DEFAULT;

export const normalizeSidebarGlowShape = (value: unknown): SidebarGlowShape =>
  typeof value === "string" &&
  SIDEBAR_GLOW_SHAPE_VALUES.includes(value as SidebarGlowShape)
    ? (value as SidebarGlowShape)
    : SIDEBAR_GLOW_SHAPE_DEFAULT;

export const normalizeSidebarGlowBlur = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(
        SIDEBAR_GLOW_BLUR_MAX,
        Math.max(SIDEBAR_GLOW_BLUR_MIN, Math.round(numericValue)),
      )
    : SIDEBAR_GLOW_BLUR_DEFAULT;
};

export const normalizeSidebarGlowIntensity = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(
        SIDEBAR_GLOW_INTENSITY_MAX,
        Math.max(SIDEBAR_GLOW_INTENSITY_MIN, Math.round(numericValue)),
      )
    : SIDEBAR_GLOW_INTENSITY_DEFAULT;
};

export const normalizeSidebarGlowShapeSize = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.min(
        SIDEBAR_GLOW_SHAPE_SIZE_MAX,
        Math.max(SIDEBAR_GLOW_SHAPE_SIZE_MIN, Math.round(numericValue)),
      )
    : SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT;
};

export const applySidebarGlowShapeSize = (
  value: unknown,
  root: HTMLElement | undefined = typeof document === "undefined"
    ? undefined
    : document.documentElement,
): number => {
  const normalizedSize = normalizeSidebarGlowShapeSize(value);
  if (!root) return normalizedSize;

  const scale = normalizedSize / SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT;
  for (const [property, baseLength] of SIDEBAR_GLOW_SHAPE_BASE_LENGTHS) {
    root.style.setProperty(property, `${(baseLength * scale).toFixed(2)}px`);
  }
  return normalizedSize;
};

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
  showSidebarOnMobile?: boolean;
  glowPalette?: SidebarGlow;
  glowShape?: SidebarGlowShape;
  glowShapeSize?: number;
  glowBlur?: number;
  glowIntensity?: number;
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
  seekIntervalSeconds: number;
  resumeFromLastPosition: boolean;
  startInTheaterMode: boolean;
  showLessonPageScrollbar: boolean;
  showCurriculumScrollbar: boolean;
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
export const LEARNING_SEEK_INTERVAL_MIN = 5;
export const LEARNING_SEEK_INTERVAL_MAX = 60;
export const LEARNING_SEEK_INTERVAL_DEFAULT = 10;
export const LEARNING_SEEK_INTERVAL_PRESETS = [5, 10, 15, 30, 60] as const;

export const normalizeLearningSeekInterval = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return LEARNING_SEEK_INTERVAL_DEFAULT;
  return Math.min(
    LEARNING_SEEK_INTERVAL_MAX,
    Math.max(LEARNING_SEEK_INTERVAL_MIN, Math.round(numericValue)),
  );
};

export const LEARNING_PREFERENCE_DEFAULTS: LearningPreferences = {
  videoQuality: "auto",
  playbackSpeed: "1",
  seekIntervalSeconds: LEARNING_SEEK_INTERVAL_DEFAULT,
  resumeFromLastPosition: true,
  startInTheaterMode: false,
  showLessonPageScrollbar: true,
  showCurriculumScrollbar: true,
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

export const normalizeScrollbarStyle = (value: unknown): ScrollbarStyle =>
  SCROLLBAR_STYLE_VALUES.includes(value as ScrollbarStyle)
    ? (value as ScrollbarStyle)
    : SCROLLBAR_STYLE_DEFAULT;

export const readScrollbarStyle = (): ScrollbarStyle =>
  normalizeScrollbarStyle(
    readStored(SCROLLBAR_STYLE_KEY, SCROLLBAR_STYLE_DEFAULT),
  );

export const normalizeElasticScrollAppearance = (
  value: unknown,
): ElasticScrollAppearance =>
  ELASTIC_SCROLL_APPEARANCE_VALUES.includes(value as ElasticScrollAppearance)
    ? (value as ElasticScrollAppearance)
    : ELASTIC_SCROLL_APPEARANCE_DEFAULT;

export const normalizeElasticScrollIcon = (
  value: unknown,
): ElasticScrollIcon =>
  ELASTIC_SCROLL_ICON_VALUES.includes(value as ElasticScrollIcon)
    ? (value as ElasticScrollIcon)
    : ELASTIC_SCROLL_ICON_DEFAULT;

export const normalizeElasticScrollGestureSide = (
  value: unknown,
  fallback: ElasticScrollGestureSide,
): ElasticScrollGestureSide =>
  ELASTIC_SCROLL_GESTURE_SIDE_VALUES.includes(value as ElasticScrollGestureSide)
    ? (value as ElasticScrollGestureSide)
    : fallback;

export const readElasticScrollPreferences = (): ElasticScrollPreferences => ({
  appearance: normalizeElasticScrollAppearance(
    readStored(
      ELASTIC_SCROLL_APPEARANCE_KEY,
      ELASTIC_SCROLL_APPEARANCE_DEFAULT,
    ),
  ),
  icon: normalizeElasticScrollIcon(
    readStored(ELASTIC_SCROLL_ICON_KEY, ELASTIC_SCROLL_ICON_DEFAULT),
  ),
  animateIcon: readStoredBoolean(
    ELASTIC_SCROLL_ICON_ANIMATION_KEY,
    ELASTIC_SCROLL_ICON_ANIMATION_DEFAULT,
  ),
  lockSide: normalizeElasticScrollGestureSide(
    readStored(ELASTIC_SCROLL_LOCK_SIDE_KEY, ELASTIC_SCROLL_LOCK_SIDE_DEFAULT),
    ELASTIC_SCROLL_LOCK_SIDE_DEFAULT,
  ),
  unlockSide: normalizeElasticScrollGestureSide(
    readStored(
      ELASTIC_SCROLL_UNLOCK_SIDE_KEY,
      ELASTIC_SCROLL_UNLOCK_SIDE_DEFAULT,
    ),
    ELASTIC_SCROLL_UNLOCK_SIDE_DEFAULT,
  ),
});

export const applyElasticScrollPreferences = (
  preferences: Partial<ElasticScrollPreferences>,
): ElasticScrollPreferences => {
  const normalizedPreferences = {
    appearance: normalizeElasticScrollAppearance(preferences.appearance),
    icon: normalizeElasticScrollIcon(preferences.icon),
    animateIcon:
      typeof preferences.animateIcon === "boolean"
        ? preferences.animateIcon
        : ELASTIC_SCROLL_ICON_ANIMATION_DEFAULT,
    lockSide: normalizeElasticScrollGestureSide(
      preferences.lockSide,
      ELASTIC_SCROLL_LOCK_SIDE_DEFAULT,
    ),
    unlockSide: normalizeElasticScrollGestureSide(
      preferences.unlockSide,
      ELASTIC_SCROLL_UNLOCK_SIDE_DEFAULT,
    ),
  };
  if (typeof document !== "undefined") {
    document.documentElement.dataset.elasticScrollAppearance =
      normalizedPreferences.appearance;
    document.documentElement.dataset.elasticScrollIcon =
      normalizedPreferences.icon;
    document.documentElement.dataset.elasticScrollIconAnimation = String(
      normalizedPreferences.animateIcon,
    );
    document.documentElement.dataset.elasticScrollLockSide =
      normalizedPreferences.lockSide;
    document.documentElement.dataset.elasticScrollUnlockSide =
      normalizedPreferences.unlockSide;
  }
  return normalizedPreferences;
};

export const persistElasticScrollPreferences = (
  preferences: Partial<ElasticScrollPreferences>,
): ElasticScrollPreferences => {
  const normalizedPreferences = applyElasticScrollPreferences(preferences);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        ELASTIC_SCROLL_APPEARANCE_KEY,
        normalizedPreferences.appearance,
      );
      window.localStorage.setItem(
        ELASTIC_SCROLL_ICON_KEY,
        normalizedPreferences.icon,
      );
      window.localStorage.setItem(
        ELASTIC_SCROLL_ICON_ANIMATION_KEY,
        String(normalizedPreferences.animateIcon),
      );
      window.localStorage.setItem(
        ELASTIC_SCROLL_LOCK_SIDE_KEY,
        normalizedPreferences.lockSide,
      );
      window.localStorage.setItem(
        ELASTIC_SCROLL_UNLOCK_SIDE_KEY,
        normalizedPreferences.unlockSide,
      );
    } catch {
      // Keep the preference active for this session when storage is blocked.
    }
    window.dispatchEvent(
      new CustomEvent<ElasticScrollPreferences>(
        ELASTIC_SCROLL_PREFERENCES_EVENT,
        { detail: normalizedPreferences },
      ),
    );
  }
  return normalizedPreferences;
};

export const getScrollbarBootstrapScript = (): string =>
  `(()=>{const root=document.documentElement;try{const stored=localStorage.getItem(${JSON.stringify(
    HIDE_SCROLLBARS_KEY,
  )});root.dataset.hideScrollbars=String(stored===null?${HIDE_SCROLLBARS_DEFAULT}:stored==="true")}catch{root.dataset.hideScrollbars=${JSON.stringify(String(HIDE_SCROLLBARS_DEFAULT))}}try{const styles=${JSON.stringify(SCROLLBAR_STYLE_VALUES)},stored=localStorage.getItem(${JSON.stringify(
    SCROLLBAR_STYLE_KEY,
  )});root.dataset.scrollbarStyle=styles.includes(stored)?stored:${JSON.stringify(
    SCROLLBAR_STYLE_DEFAULT,
  )}}catch{root.dataset.scrollbarStyle=${JSON.stringify(
    SCROLLBAR_STYLE_DEFAULT,
  )}}try{const appearances=${JSON.stringify(ELASTIC_SCROLL_APPEARANCE_VALUES)},icons=${JSON.stringify(ELASTIC_SCROLL_ICON_VALUES)},appearance=localStorage.getItem(${JSON.stringify(
    ELASTIC_SCROLL_APPEARANCE_KEY,
  )}),icon=localStorage.getItem(${JSON.stringify(
    ELASTIC_SCROLL_ICON_KEY,
  )}),animate=localStorage.getItem(${JSON.stringify(
    ELASTIC_SCROLL_ICON_ANIMATION_KEY,
  )}),sides=${JSON.stringify(ELASTIC_SCROLL_GESTURE_SIDE_VALUES)},lockSide=localStorage.getItem(${JSON.stringify(
    ELASTIC_SCROLL_LOCK_SIDE_KEY,
  )}),unlockSide=localStorage.getItem(${JSON.stringify(
    ELASTIC_SCROLL_UNLOCK_SIDE_KEY,
  )});root.dataset.elasticScrollAppearance=appearances.includes(appearance)?appearance:${JSON.stringify(
    ELASTIC_SCROLL_APPEARANCE_DEFAULT,
  )};root.dataset.elasticScrollIcon=icons.includes(icon)?icon:${JSON.stringify(
    ELASTIC_SCROLL_ICON_DEFAULT,
  )};root.dataset.elasticScrollIconAnimation=String(animate==="true");root.dataset.elasticScrollLockSide=sides.includes(lockSide)?lockSide:${JSON.stringify(
    ELASTIC_SCROLL_LOCK_SIDE_DEFAULT,
  )};root.dataset.elasticScrollUnlockSide=sides.includes(unlockSide)?unlockSide:${JSON.stringify(
    ELASTIC_SCROLL_UNLOCK_SIDE_DEFAULT,
  )}}catch{root.dataset.elasticScrollAppearance=${JSON.stringify(
    ELASTIC_SCROLL_APPEARANCE_DEFAULT,
  )};root.dataset.elasticScrollIcon=${JSON.stringify(
    ELASTIC_SCROLL_ICON_DEFAULT,
  )};root.dataset.elasticScrollIconAnimation=${JSON.stringify(
    String(ELASTIC_SCROLL_ICON_ANIMATION_DEFAULT),
  )};root.dataset.elasticScrollLockSide=${JSON.stringify(
    ELASTIC_SCROLL_LOCK_SIDE_DEFAULT,
  )};root.dataset.elasticScrollUnlockSide=${JSON.stringify(
    ELASTIC_SCROLL_UNLOCK_SIDE_DEFAULT,
  )}}try{const learning=JSON.parse(localStorage.getItem(${JSON.stringify(
    LEARNING_PREFERENCES_KEY,
  )})||"{}");root.dataset.lessonPageScrollbar=learning.showLessonPageScrollbar===false?"hidden":"visible";root.dataset.curriculumScrollbar=learning.showCurriculumScrollbar===false?"hidden":"visible"}catch{root.dataset.lessonPageScrollbar="visible";root.dataset.curriculumScrollbar="visible"}})();`;

export const readElevatedSurfaces = (): boolean =>
  readStoredBoolean(ELEVATED_SURFACES_KEY, true);

export const readControlRadiusPreference = (): ControlRadiusPreference => ({
  preset: normalizeControlRadiusPreset(
    readStored(CONTROL_RADIUS_KEY, CONTROL_RADIUS_DEFAULT.preset),
  ),
  customPx: normalizeControlRadiusCustom(
    readStored(
      CONTROL_RADIUS_CUSTOM_KEY,
      String(CONTROL_RADIUS_DEFAULT.customPx),
    ),
  ),
});

export const applyControlRadiusPreference = (
  preference: ControlRadiusPreference,
): ControlRadiusPreference => {
  const normalizedPreference = {
    preset: normalizeControlRadiusPreset(preference.preset),
    customPx: normalizeControlRadiusCustom(preference.customPx),
  };
  if (typeof document !== "undefined") {
    const resolvedRadius = resolveControlRadius(normalizedPreference);
    const structuredRadius = Math.min(
      resolvedRadius,
      CONTROL_RADIUS_STRUCTURED_MAX,
    );
    document.documentElement.dataset.controlRadius =
      normalizedPreference.preset;
    document.documentElement.style.setProperty(
      "--control-radius",
      `${resolvedRadius}px`,
    );
    document.documentElement.style.setProperty(
      "--control-radius-action",
      `${resolvedRadius}px`,
    );
    document.documentElement.style.setProperty(
      "--control-radius-structured",
      `${structuredRadius}px`,
    );
    document.documentElement.style.setProperty(
      "--control-radius-menu",
      `${structuredRadius}px`,
    );
  }
  return normalizedPreference;
};

export const persistControlRadiusPreference = (
  preference: ControlRadiusPreference,
): ControlRadiusPreference => {
  const normalizedPreference = applyControlRadiusPreference(preference);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        CONTROL_RADIUS_KEY,
        normalizedPreference.preset,
      );
      window.localStorage.setItem(
        CONTROL_RADIUS_CUSTOM_KEY,
        String(normalizedPreference.customPx),
      );
    } catch {
      // Keep the preference active for this session when storage is blocked.
    }
  }
  return normalizedPreference;
};

export const getControlRadiusBootstrapScript = (): string =>
  `(()=>{const r=document.documentElement,p=${JSON.stringify(
    CONTROL_RADIUS_PRESETS,
  )},d=${JSON.stringify(CONTROL_RADIUS_DEFAULT)},min=${CONTROL_RADIUS_CUSTOM_MIN},max=${CONTROL_RADIUS_CUSTOM_MAX},structuredMax=${CONTROL_RADIUS_STRUCTURED_MAX};try{const s=localStorage.getItem(${JSON.stringify(
    CONTROL_RADIUS_KEY,
  )}),id=p.some(({id})=>id===s)||s==="custom"?s:d.preset,storedCustom=localStorage.getItem(${JSON.stringify(
    CONTROL_RADIUS_CUSTOM_KEY,
  )}),raw=storedCustom===null?Number.NaN:Number(storedCustom),custom=Number.isFinite(raw)?Math.min(max,Math.max(min,Math.round(raw))):d.customPx,value=id==="custom"?custom:(p.find(({id:preset})=>preset===id)?.radius??d.customPx),structured=Math.min(value,structuredMax);r.dataset.controlRadius=id;r.style.setProperty("--control-radius",value+"px");r.style.setProperty("--control-radius-action",value+"px");r.style.setProperty("--control-radius-structured",structured+"px");r.style.setProperty("--control-radius-menu",structured+"px")}catch{r.dataset.controlRadius=d.preset;r.style.setProperty("--control-radius",d.customPx+"px");r.style.setProperty("--control-radius-action",d.customPx+"px");r.style.setProperty("--control-radius-structured",d.customPx+"px");r.style.setProperty("--control-radius-menu",d.customPx+"px")}})();`;

export const getSurfaceDepthBootstrapScript = (): string => {
  const sidebarGlowShapeLengths = JSON.stringify(
    SIDEBAR_GLOW_SHAPE_BASE_LENGTHS,
  );
  return `(()=>{const root=document.documentElement,sidebarGlows=${JSON.stringify(
    SIDEBAR_GLOW_VALUES,
  )},sidebarGlowShapes=${JSON.stringify(SIDEBAR_GLOW_SHAPE_VALUES)},defaultSidebarGlow=${JSON.stringify(SIDEBAR_GLOW_DEFAULT)},defaultSidebarGlowShape=${JSON.stringify(SIDEBAR_GLOW_SHAPE_DEFAULT)},defaultSidebarGlowBlur=${SIDEBAR_GLOW_BLUR_DEFAULT},defaultSidebarGlowIntensity=${SIDEBAR_GLOW_INTENSITY_DEFAULT},defaultSidebarGlowShapeSize=${SIDEBAR_GLOW_SHAPE_SIZE_DEFAULT},sidebarGlowShapeSizeMin=${SIDEBAR_GLOW_SHAPE_SIZE_MIN},sidebarGlowShapeSizeMax=${SIDEBAR_GLOW_SHAPE_SIZE_MAX},sidebarGlowShapeLengths=${sidebarGlowShapeLengths},applyGlowShapeSize=value=>{const scale=value/defaultSidebarGlowShapeSize;for(const [property,length] of sidebarGlowShapeLengths)root.style.setProperty(property,(length*scale).toFixed(2)+"px")};try{root.dataset.elevatedSurfaces=localStorage.getItem(${JSON.stringify(
    ELEVATED_SURFACES_KEY,
  )})==="false"?"false":"true"}catch{}try{const pageTabs=localStorage.getItem(${JSON.stringify(
    PAGE_TAB_COLORS_KEY,
  )});root.dataset.pageTabColors=pageTabs==="multicolor"||pageTabs==="monochrome"||pageTabs==="follow-sidebar"?pageTabs:${JSON.stringify(
    PAGE_TAB_COLORS_DEFAULT,
  )}}catch{root.dataset.pageTabColors=${JSON.stringify(
    PAGE_TAB_COLORS_DEFAULT,
  )}}try{const sidebar=JSON.parse(localStorage.getItem("veolms-sidebar-preferences")||"{}"),rawGlowBlur=Number(sidebar.glowBlur),glowBlur=Number.isFinite(rawGlowBlur)?Math.min(${SIDEBAR_GLOW_BLUR_MAX},Math.max(${SIDEBAR_GLOW_BLUR_MIN},Math.round(rawGlowBlur))):defaultSidebarGlowBlur,rawGlowIntensity=Number(sidebar.glowIntensity),glowIntensity=Number.isFinite(rawGlowIntensity)?Math.min(100,Math.max(0,Math.round(rawGlowIntensity))):defaultSidebarGlowIntensity,rawGlowShapeSize=Number(sidebar.glowShapeSize),glowShapeSize=Number.isFinite(rawGlowShapeSize)?Math.min(sidebarGlowShapeSizeMax,Math.max(sidebarGlowShapeSizeMin,Math.round(rawGlowShapeSize))):defaultSidebarGlowShapeSize;root.dataset.sidebarMenuElevation=String(typeof sidebar.elevateMenus==="boolean"?sidebar.elevateMenus:typeof sidebar.alwaysElevateMenus==="boolean"?sidebar.alwaysElevateMenus:true);root.dataset.sidebarIconStyle=sidebar.iconStyle==="multicolor"?"multicolor":"monochrome";root.dataset.contentLayout=sidebar.contentLayout==="edge-to-edge"?"edge-to-edge":"framed";root.dataset.sidebarHeaderLayout=sidebar.headerLayout==="fixed"?"fixed":"inline";root.dataset.sidebarGlow=sidebarGlows.includes(sidebar.glowPalette)?sidebar.glowPalette:defaultSidebarGlow;root.dataset.sidebarGlowShape=sidebarGlowShapes.includes(sidebar.glowShape)?sidebar.glowShape:defaultSidebarGlowShape;root.dataset.sidebarBackdropBlur=glowBlur===0?"off":"on";root.style.setProperty("--sidebar-backdrop-blur",glowBlur+"px");root.style.setProperty("--sidebar-glow-intensity",String(glowIntensity/100));applyGlowShapeSize(glowShapeSize)}catch{root.dataset.sidebarMenuElevation="true";root.dataset.sidebarIconStyle="monochrome";root.dataset.contentLayout="framed";root.dataset.sidebarHeaderLayout="inline";root.dataset.sidebarGlow=defaultSidebarGlow;root.dataset.sidebarGlowShape=defaultSidebarGlowShape;root.dataset.sidebarBackdropBlur="on";root.style.setProperty("--sidebar-backdrop-blur",defaultSidebarGlowBlur+"px");root.style.setProperty("--sidebar-glow-intensity",String(defaultSidebarGlowIntensity/100));applyGlowShapeSize(defaultSidebarGlowShapeSize)}})();`;
};

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
      seekIntervalSeconds: normalizeLearningSeekInterval(
        storedPreferences.seekIntervalSeconds,
      ),
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
