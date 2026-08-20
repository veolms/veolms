import type { Database } from "@veolms/database";
import { type Kysely } from "kysely";

type Executor = Kysely<Database>;

export async function getSystemConfig(database: Executor) {
  const rows = await database
    .selectFrom("system_config")
    .selectAll()
    .where("is_public", "=", true)
    .execute();

  const branding: Record<string, string> = {};
  const theme: Record<string, string> = {};
  const layout: Record<string, string> = {};
  const featureFlags: Record<string, boolean> = {};

  for (const row of rows) {
    if (row.namespace === "branding") {
      branding[row.key] = row.value;
    } else if (row.namespace === "theme") {
      theme[row.key] = row.value;
    } else if (row.namespace === "layout") {
      layout[row.key] = row.value;
    } else if (row.namespace === "feature_flags") {
      featureFlags[row.key] = row.value === "true";
    }
  }

  return { branding, theme, layout, featureFlags };
}

export async function getActiveThemePresets(database: Executor) {
  const rows = await database
    .selectFrom("theme_presets")
    .selectAll()
    .where("is_active", "=", true)
    .orderBy("sort_order", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    accentColor: row.accent_color,
    previewColor: row.preview_color,
    darkInk: row.dark_ink,
    tokensDark: typeof row.tokens_dark === "string" ? JSON.parse(row.tokens_dark) : row.tokens_dark,
    tokensLight: typeof row.tokens_light === "string" ? JSON.parse(row.tokens_light) : row.tokens_light,
    isDefault: row.is_default,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }));
}

export async function getUserPreferences(database: Executor, userId: string) {
  const row = await database
    .selectFrom("user_preferences")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    uiMode: row.ui_mode,
    colorTheme: row.color_theme,
    randomThemeOnOpen: row.random_theme_on_open,
    themeRotationPool: row.theme_rotation_pool,
    reduceAnimations: row.reduce_animations,
    highContrastMode: row.high_contrast_mode,
    compactLayout: row.compact_layout,
    hideScrollbars: row.hide_scrollbars,
    elevatedSurfaces: row.elevated_surfaces,
    shortcutPlatformPreference: row.shortcut_platform_preference as "system" | "windows" | "mac",
    textSize: row.text_size as "small" | "default" | "large" | "extra-large",
    pageTabColors: row.page_tab_colors as "follow-sidebar" | "multicolor" | "monochrome",
    readingModeEnabled: row.reading_mode_enabled,
    readingModeColorTemperature: row.reading_mode_color_temperature,
    readingModeTexture: row.reading_mode_texture,
    readingModeColors: row.reading_mode_colors,
    sidebarIconStyle: row.sidebar_icon_style as "multicolor" | "monochrome",
    sidebarIconColorMode: row.sidebar_icon_color_mode as "theme" | "neutral" | "custom",
    sidebarIconCustomColor: row.sidebar_icon_custom_color,
    mainContentLayout: row.main_content_layout as "framed" | "edge-to-edge",
    sidebarMaxWidthPx: row.sidebar_max_width_px,
    sidebarHeaderLayout: row.sidebar_header_layout as "fixed" | "inline",
    sidebarDockItems: row.sidebar_dock_items,
    sidebarDockOrder: row.sidebar_dock_order,
    sidebarShowKeyboardShortcuts: row.sidebar_show_keyboard_shortcuts,
    sidebarShowLabelsCollapsed: row.sidebar_show_labels_collapsed,
    sidebarShowLogoCollapsed: row.sidebar_show_logo_collapsed,
    sidebarHighlightActiveItem: row.sidebar_highlight_active_item,
    sidebarElevateMenus: row.sidebar_elevate_menus,
    sidebarHidden: row.sidebar_hidden,
    defaultVideoQuality: row.default_video_quality,
    defaultPlaybackSpeed: row.default_playback_speed,
    resumeFromLastPosition: row.resume_from_last_position,
    startInTheatreMode: row.start_in_theatre_mode,
    weeklyLearningGoalHrs: row.weekly_learning_goal_hrs ? Number(row.weekly_learning_goal_hrs) : null,
    learningRemindersEnabled: row.learning_reminders_enabled,
    reminderDays: row.reminder_days,
    reminderTime: row.reminder_time,
    reminderTimezone: row.reminder_timezone,
    showCaptionsByDefault: row.show_captions_by_default,
    preferredCaptionLanguage: row.preferred_caption_language,
    autoScrollTranscript: row.auto_scroll_transcript,
    highlightTranscriptLine: row.highlight_transcript_line,
    openCurrentSectionAuto: row.open_current_section_auto,
    continueNextIncompleteLecture: row.continue_next_incomplete_lecture,
    autoMoveNextSection: row.auto_move_next_section,
    keepCompletedLecturesVisible: row.keep_completed_lectures_visible,
  };
}

export async function upsertUserPreferences(
  database: Executor,
  userId: string,
  updates: Record<string, unknown>
) {
  const dbFields: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date(),
  };

  const fieldMapping: Record<string, string> = {
    uiMode: "ui_mode",
    colorTheme: "color_theme",
    randomThemeOnOpen: "random_theme_on_open",
    themeRotationPool: "theme_rotation_pool",
    reduceAnimations: "reduce_animations",
    highContrastMode: "high_contrast_mode",
    compactLayout: "compact_layout",
    hideScrollbars: "hide_scrollbars",
    elevatedSurfaces: "elevated_surfaces",
    shortcutPlatformPreference: "shortcut_platform_preference",
    textSize: "text_size",
    pageTabColors: "page_tab_colors",
    readingModeEnabled: "reading_mode_enabled",
    readingModeColorTemperature: "reading_mode_color_temperature",
    readingModeTexture: "reading_mode_texture",
    readingModeColors: "reading_mode_colors",
    sidebarIconStyle: "sidebar_icon_style",
    sidebarIconColorMode: "sidebar_icon_color_mode",
    sidebarIconCustomColor: "sidebar_icon_custom_color",
    mainContentLayout: "main_content_layout",
    sidebarMaxWidthPx: "sidebar_max_width_px",
    sidebarHeaderLayout: "sidebar_header_layout",
    sidebarDockItems: "sidebar_dock_items",
    sidebarDockOrder: "sidebar_dock_order",
    sidebarShowKeyboardShortcuts: "sidebar_show_keyboard_shortcuts",
    sidebarShowLabelsCollapsed: "sidebar_show_labels_collapsed",
    sidebarShowLogoCollapsed: "sidebar_show_logo_collapsed",
    sidebarHighlightActiveItem: "sidebar_highlight_active_item",
    sidebarElevateMenus: "sidebar_elevate_menus",
    sidebarHidden: "sidebar_hidden",
    defaultVideoQuality: "default_video_quality",
    defaultPlaybackSpeed: "default_playback_speed",
    resumeFromLastPosition: "resume_from_last_position",
    startInTheatreMode: "start_in_theatre_mode",
    weeklyLearningGoalHrs: "weekly_learning_goal_hrs",
    learningRemindersEnabled: "learning_reminders_enabled",
    reminderDays: "reminder_days",
    reminderTime: "reminder_time",
    reminderTimezone: "reminder_timezone",
    showCaptionsByDefault: "show_captions_by_default",
    preferredCaptionLanguage: "preferred_caption_language",
    autoScrollTranscript: "auto_scroll_transcript",
    highlightTranscriptLine: "highlight_transcript_line",
    openCurrentSectionAuto: "open_current_section_auto",
    continueNextIncompleteLecture: "continue_next_incomplete_lecture",
    autoMoveNextSection: "auto_move_next_section",
    keepCompletedLecturesVisible: "keep_completed_lectures_visible",
  };

  for (const [jsKey, dbCol] of Object.entries(fieldMapping)) {
    if (jsKey in updates && updates[jsKey] !== undefined) {
      const val = updates[jsKey];
      if (Array.isArray(val) && (dbCol === "sidebar_dock_items" || dbCol === "sidebar_dock_order")) {
        dbFields[dbCol] = JSON.stringify(val);
      } else {
        dbFields[dbCol] = val;
      }
    }
  }

  await database
    .insertInto("user_preferences")
    .values(dbFields as any)
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet(dbFields as any)
    )
    .execute();

  return getUserPreferences(database, userId);
}

// --- Admin Operations --------------------------------------------------------

export async function getAllSystemConfigsAdmin(database: Executor) {
  const rows = await database
    .selectFrom("system_config")
    .selectAll()
    .orderBy("namespace", "asc")
    .orderBy("key", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    namespace: row.namespace,
    key: row.key,
    value: row.value,
    valueType: row.value_type,
    label: row.label,
    description: row.description,
    isPublic: row.is_public,
  }));
}

export async function updateSystemConfigAdmin(
  database: Executor,
  adminUserId: string,
  namespace: string,
  key: string,
  input: { value: string; label?: string; description?: string; isPublic?: boolean }
) {
  const existing = await database
    .selectFrom("system_config")
    .selectAll()
    .where("namespace", "=", namespace)
    .where("key", "=", key)
    .executeTakeFirst();

  const updatePayload: Record<string, unknown> = {
    value: input.value,
    updated_at: new Date(),
  };
  if (input.label !== undefined) updatePayload.label = input.label;
  if (input.description !== undefined) updatePayload.description = input.description;
  if (input.isPublic !== undefined) updatePayload.is_public = input.isPublic;

  if (existing) {
    await database
      .updateTable("system_config")
      .set(updatePayload)
      .where("id", "=", existing.id)
      .execute();

    await database.insertInto("config_audit_log").values({
      changed_by: adminUserId,
      table_name: "system_config",
      record_id: existing.id,
      field_name: `${namespace}.${key}`,
      old_value: existing.value,
      new_value: input.value,
    }).execute();
  } else {
    const inserted = await database
      .insertInto("system_config")
      .values({
        namespace,
        key,
        value: input.value,
        label: input.label ?? null,
        description: input.description ?? null,
        is_public: input.isPublic ?? true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await database.insertInto("config_audit_log").values({
      changed_by: adminUserId,
      table_name: "system_config",
      record_id: inserted.id,
      field_name: `${namespace}.${key}`,
      old_value: null,
      new_value: input.value,
    }).execute();
  }

  return getSystemConfig(database);
}

export async function getAllThemePresetsAdmin(database: Executor) {
  const rows = await database
    .selectFrom("theme_presets")
    .selectAll()
    .orderBy("sort_order", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    accentColor: row.accent_color,
    previewColor: row.preview_color,
    darkInk: row.dark_ink,
    tokensDark: typeof row.tokens_dark === "string" ? JSON.parse(row.tokens_dark) : row.tokens_dark,
    tokensLight: typeof row.tokens_light === "string" ? JSON.parse(row.tokens_light) : row.tokens_light,
    isDefault: row.is_default,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }));
}

export async function createThemePresetAdmin(
  database: Executor,
  adminUserId: string,
  input: {
    slug: string;
    name: string;
    description?: string;
    accentColor: string;
    previewColor: string;
    darkInk?: boolean;
    tokensDark?: Record<string, string>;
    tokensLight?: Record<string, string>;
    isDefault?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }
) {
  const inserted = await database
    .insertInto("theme_presets")
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      accent_color: input.accentColor,
      preview_color: input.previewColor,
      dark_ink: input.darkInk ?? false,
      tokens_dark: JSON.stringify(input.tokensDark ?? {}),
      tokens_light: JSON.stringify(input.tokensLight ?? {}),
      is_default: input.isDefault ?? false,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await database.insertInto("config_audit_log").values({
    changed_by: adminUserId,
    table_name: "theme_presets",
    record_id: inserted.id,
    field_name: "create_theme",
    old_value: null,
    new_value: input.slug,
  }).execute();

  return getActiveThemePresets(database);
}

export async function updateThemePresetAdmin(
  database: Executor,
  adminUserId: string,
  slug: string,
  input: Record<string, unknown>
) {
  const existing = await database
    .selectFrom("theme_presets")
    .selectAll()
    .where("slug", "=", slug)
    .executeTakeFirst();

  if (!existing) return null;

  const updatePayload: Record<string, unknown> = { updated_at: new Date() };
  if ("name" in input && input.name !== undefined) updatePayload.name = input.name;
  if ("description" in input && input.description !== undefined) updatePayload.description = input.description;
  if ("accentColor" in input && input.accentColor !== undefined) updatePayload.accent_color = input.accentColor;
  if ("previewColor" in input && input.previewColor !== undefined) updatePayload.preview_color = input.previewColor;
  if ("darkInk" in input && input.darkInk !== undefined) updatePayload.dark_ink = input.darkInk;
  if ("tokensDark" in input && input.tokensDark !== undefined) updatePayload.tokens_dark = JSON.stringify(input.tokensDark);
  if ("tokensLight" in input && input.tokensLight !== undefined) updatePayload.tokens_light = JSON.stringify(input.tokensLight);
  if ("isDefault" in input && input.isDefault !== undefined) updatePayload.is_default = input.isDefault;
  if ("isActive" in input && input.isActive !== undefined) updatePayload.is_active = input.isActive;
  if ("sortOrder" in input && input.sortOrder !== undefined) updatePayload.sort_order = input.sortOrder;

  await database
    .updateTable("theme_presets")
    .set(updatePayload)
    .where("id", "=", existing.id)
    .execute();

  await database.insertInto("config_audit_log").values({
    changed_by: adminUserId,
    table_name: "theme_presets",
    record_id: existing.id,
    field_name: "update_theme",
    old_value: existing.slug,
    new_value: JSON.stringify(input),
  }).execute();

  return getActiveThemePresets(database);
}

export async function deleteThemePresetAdmin(
  database: Executor,
  adminUserId: string,
  slug: string
) {
  const existing = await database
    .selectFrom("theme_presets")
    .selectAll()
    .where("slug", "=", slug)
    .executeTakeFirst();

  if (!existing) return false;

  await database
    .updateTable("theme_presets")
    .set({ is_active: false, updated_at: new Date() })
    .where("id", "=", existing.id)
    .execute();

  await database.insertInto("config_audit_log").values({
    changed_by: adminUserId,
    table_name: "theme_presets",
    record_id: existing.id,
    field_name: "soft_delete_theme",
    old_value: existing.slug,
    new_value: "is_active=false",
  }).execute();

  return true;
}

