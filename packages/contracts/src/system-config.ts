import { z } from "zod";

export const systemConfigItemSchema = z.object({
  id: z.string().optional(),
  namespace: z.string(),
  key: z.string(),
  value: z.string(),
  valueType: z.string().default("string"),
  label: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().default(true),
});

export const systemConfigResponseSchema = z.object({
  branding: z.record(z.string(), z.string()),
  theme: z.record(z.string(), z.string()),
  layout: z.record(z.string(), z.string()),
  featureFlags: z.record(z.string(), z.boolean()),
});

export const themePresetSchema = z.object({
  id: z.string().optional(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  accentColor: z.string(),
  previewColor: z.string(),
  darkInk: z.boolean().default(false),
  tokensDark: z.record(z.string(), z.string()).optional(),
  tokensLight: z.record(z.string(), z.string()).optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
});

export const themeListResponseSchema = z.object({
  themes: z.array(themePresetSchema),
});

export const createThemePresetInputSchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(1),
  description: z.string().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  previewColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  darkInk: z.boolean().optional().default(false),
  tokensDark: z.record(z.string(), z.string()).optional().default({}),
  tokensLight: z.record(z.string(), z.string()).optional().default({}),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().optional().default(0),
});

export const updateThemePresetInputSchema = z.object({
  slug: z.string().min(2).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  previewColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  darkInk: z.boolean().optional(),
  tokensDark: z.record(z.string(), z.string()).optional(),
  tokensLight: z.record(z.string(), z.string()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export const userPreferencesSchema = z.object({
  uiMode: z.enum(["light", "dark", "system"]).nullable().optional(),
  colorTheme: z.string().nullable().optional(),
  randomThemeOnOpen: z.boolean().optional(),
  themeRotationPool: z.array(z.string()).nullable().optional(),
  reduceAnimations: z.boolean().optional(),
  highContrastMode: z.boolean().optional(),
  compactLayout: z.boolean().optional(),
  hideScrollbars: z.boolean().optional(),
  elevatedSurfaces: z.boolean().optional(),
  shortcutPlatformPreference: z.enum(["system", "windows", "mac"]).optional(),
  textSize: z.enum(["small", "default", "large", "extra-large"]).optional(),
  pageTabColors: z.enum(["follow-sidebar", "multicolor", "monochrome"]).optional(),
  readingModeEnabled: z.boolean().optional(),
  readingModeColorTemperature: z.number().int().min(0).max(100).optional(),
  readingModeTexture: z.number().int().min(0).max(100).optional(),
  readingModeColors: z.string().optional(),
  sidebarIconStyle: z.enum(["multicolor", "monochrome"]).optional(),
  sidebarIconColorMode: z.enum(["theme", "neutral", "custom"]).optional(),
  sidebarIconCustomColor: z.string().nullable().optional(),
  mainContentLayout: z.enum(["framed", "edge-to-edge"]).optional(),
  sidebarMaxWidthPx: z.number().int().min(220).max(520).optional(),
  sidebarHeaderLayout: z.enum(["fixed", "inline"]).optional(),
  sidebarDockItems: z.array(z.string()).nullable().optional(),
  sidebarDockOrder: z.array(z.string()).nullable().optional(),
  sidebarShowKeyboardShortcuts: z.boolean().optional(),
  sidebarShowLabelsCollapsed: z.boolean().optional(),
  sidebarShowLogoCollapsed: z.boolean().optional(),
  sidebarHighlightActiveItem: z.boolean().optional(),
  sidebarElevateMenus: z.boolean().optional(),
  sidebarHidden: z.boolean().optional(),
  defaultVideoQuality: z.string().optional(),
  defaultPlaybackSpeed: z.string().optional(),
  resumeFromLastPosition: z.boolean().optional(),
  startInTheatreMode: z.boolean().optional(),
  weeklyLearningGoalHrs: z.number().nullable().optional(),
  learningRemindersEnabled: z.boolean().optional(),
  reminderDays: z.array(z.string()).nullable().optional(),
  reminderTime: z.string().nullable().optional(),
  reminderTimezone: z.string().nullable().optional(),
  showCaptionsByDefault: z.boolean().optional(),
  preferredCaptionLanguage: z.string().optional(),
  autoScrollTranscript: z.boolean().optional(),
  highlightTranscriptLine: z.boolean().optional(),
  openCurrentSectionAuto: z.boolean().optional(),
  continueNextIncompleteLecture: z.boolean().optional(),
  autoMoveNextSection: z.boolean().optional(),
  keepCompletedLecturesVisible: z.boolean().optional(),
});

export const updateSystemConfigItemSchema = z.object({
  value: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export type SystemConfigItem = z.infer<typeof systemConfigItemSchema>;
export type SystemConfigResponse = z.infer<typeof systemConfigResponseSchema>;
export type ThemePreset = z.infer<typeof themePresetSchema>;
export type ThemeListResponse = z.infer<typeof themeListResponseSchema>;
export type CreateThemePresetInput = z.infer<typeof createThemePresetInputSchema>;
export type UpdateThemePresetInput = z.infer<typeof updateThemePresetInputSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type UpdateSystemConfigItem = z.infer<typeof updateSystemConfigItemSchema>;
