import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. system_config table
  await database.schema
    .createTable("system_config")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("namespace", "text", (column) => column.notNull())
    .addColumn("key", "text", (column) => column.notNull())
    .addColumn("value", "text", (column) => column.notNull())
    .addColumn("value_type", "text", (column) => column.notNull().defaultTo("string"))
    .addColumn("label", "text")
    .addColumn("description", "text")
    .addColumn("is_public", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addUniqueConstraint("system_config_namespace_key_unique", ["namespace", "key"])
    .execute();

  // Seed default system_config entries
  await sql`
    INSERT INTO system_config (namespace, key, value, value_type, label, description) VALUES
    ('branding', 'brand_name', 'ProCodrr', 'string', 'Brand Name', 'Platform brand name'),
    ('branding', 'academy_name', 'ProCodrr Academy', 'string', 'Academy Name', 'Full academy title'),
    ('branding', 'tagline', 'Learn by building software that lasts.', 'string', 'Tagline', 'Homepage hero tagline'),
    ('branding', 'description', 'Practical courses for building reliable software.', 'string', 'Meta Description', 'SEO meta description'),
    ('branding', 'logo_url', '/assets/logo.svg', 'string', 'Logo URL', 'Brand logo asset path'),
    ('theme', 'default_color_theme', 'codex', 'string', 'Default Color Theme', 'Fallback theme slug'),
    ('theme', 'default_mode', 'dark', 'string', 'Default Mode', 'Fallback display mode'),
    ('layout', 'main_content_layout', 'framed', 'string', 'Content Layout', 'Default layout style'),
    ('feature_flags', 'discussions_enabled', 'true', 'boolean', 'Discussions Enabled', 'Toggle discussion boards'),
    ('feature_flags', 'wishlist_enabled', 'true', 'boolean', 'Wishlist Enabled', 'Toggle wishlist features')
    ON CONFLICT (namespace, key) DO NOTHING;
  `.execute(database);

  // 2. theme_presets table
  await database.schema
    .createTable("theme_presets")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("slug", "text", (column) => column.notNull().unique())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("accent_color", "text", (column) => column.notNull())
    .addColumn("preview_color", "text", (column) => column.notNull())
    .addColumn("dark_ink", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("tokens_dark", "jsonb", (column) => column.notNull().defaultTo("{}"))
    .addColumn("tokens_light", "jsonb", (column) => column.notNull().defaultTo("{}"))
    .addColumn("is_default", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("is_active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("sort_order", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Seed 16 themes
  await sql`
    INSERT INTO theme_presets (slug, name, description, accent_color, preview_color, dark_ink, is_default, sort_order) VALUES
    ('codex', 'Veo Onyx', 'Default - charcoal & soft white', '#8b5cf6', '#f4f4f5', true, true, 0),
    ('ocean', 'Ocean Blue', 'Clear & confident', '#3b82f6', '#7193ff', true, false, 1),
    ('midnight', 'Midnight Azure', 'Deep blue & luminous', '#2563eb', '#4166d4', false, false, 2),
    ('graphite', 'Graphite Studio', 'Graphite & violet', '#7c3aed', '#8b68ff', false, false, 3),
    ('violet', 'Copper Slate', 'Mineral gray & copper', '#d97706', '#d6875f', true, false, 4),
    ('ember', 'Ember Orange', 'Warm & focused', '#ea580c', '#ff8a34', true, false, 5),
    ('sunlit', 'Sunlit Yellow', 'Bright & optimistic', '#ca8a04', '#f6c945', true, false, 6),
    ('grove', 'Grove Green', 'Calm & grounded', '#16a34a', '#4dda85', true, false, 7),
    ('rose', 'Studio Rose', 'Expressive & warm', '#db2777', '#fb6f92', true, false, 8),
    ('signal', 'Signal Red', 'Crisp & high-impact', '#dc2626', '#d92d4e', false, false, 9),
    ('barbie', 'Barbie Pink', 'Bright & iconic', '#ec4899', '#ec4d9b', true, false, 10),
    ('aurora', 'Aurora Teal', 'Cool & luminous', '#0d9488', '#28d8c6', true, false, 11),
    ('brainwave', 'Brainwave Slate', 'Cool graphite & electric blue', '#0085ff', '#0085ff', true, false, 12),
    ('lilac', 'Velvet Lilac', 'Plum depth & soft lavender', '#c18cff', '#c18cff', true, false, 13),
    ('champagne', 'Champagne Noir', 'Soft black & champagne gold', '#e6c98a', '#e6c98a', true, false, 14),
    ('lime', 'Electric Lime', 'Graphite & vivid chartreuse', '#a3e635', '#a3e635', true, false, 15)
    ON CONFLICT (slug) DO NOTHING;
  `.execute(database);

  // 3. user_preferences table
  await database.schema
    .createTable("user_preferences")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (column) => column.notNull().unique().references("users.id").onDelete("cascade"))
    .addColumn("ui_mode", "text")
    .addColumn("color_theme", "text", (column) => column.references("theme_presets.slug").onDelete("set null"))
    .addColumn("random_theme_on_open", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("theme_rotation_pool", sql`text[]`)
    .addColumn("reduce_animations", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("high_contrast_mode", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("compact_layout", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("hide_scrollbars", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("elevated_surfaces", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("shortcut_platform_preference", "text", (column) => column.notNull().defaultTo("system"))
    .addColumn("text_size", "text", (column) => column.notNull().defaultTo("default"))
    .addColumn("page_tab_colors", "text", (column) => column.notNull().defaultTo("follow-sidebar"))
    .addColumn("reading_mode_enabled", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("reading_mode_color_temperature", "integer", (column) => column.notNull().defaultTo(50))
    .addColumn("reading_mode_texture", "integer", (column) => column.notNull().defaultTo(15))
    .addColumn("reading_mode_colors", "text", (column) => column.notNull().defaultTo("sepia"))
    .addColumn("sidebar_icon_style", "text", (column) => column.notNull().defaultTo("monochrome"))
    .addColumn("sidebar_icon_color_mode", "text", (column) => column.notNull().defaultTo("theme"))
    .addColumn("sidebar_icon_custom_color", "text")
    .addColumn("main_content_layout", "text", (column) => column.notNull().defaultTo("framed"))
    .addColumn("sidebar_max_width_px", "integer", (column) => column.notNull().defaultTo(300))
    .addColumn("sidebar_header_layout", "text", (column) => column.notNull().defaultTo("inline"))
    .addColumn("sidebar_dock_items", "jsonb", (column) => column.defaultTo(sql`'["appearance","theme","reading-mode","fullscreen"]'::jsonb`))
    .addColumn("sidebar_dock_order", "jsonb", (column) => column.defaultTo(sql`'["appearance","theme","reading-mode","fullscreen","settings"]'::jsonb`))
    .addColumn("sidebar_show_keyboard_shortcuts", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("sidebar_show_labels_collapsed", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("sidebar_show_logo_collapsed", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("sidebar_highlight_active_item", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("sidebar_elevate_menus", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("sidebar_hidden", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("default_video_quality", "text", (column) => column.notNull().defaultTo("auto"))
    .addColumn("default_playback_speed", "text", (column) => column.notNull().defaultTo("1"))
    .addColumn("resume_from_last_position", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("start_in_theatre_mode", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("weekly_learning_goal_hrs", "numeric", (column) => column.defaultTo(5.0))
    .addColumn("learning_reminders_enabled", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("reminder_days", sql`text[]`, (column) => column.defaultTo(sql`ARRAY['mon','tue','wed','thu','fri']`))
    .addColumn("reminder_time", "text", (column) => column.defaultTo("19:00"))
    .addColumn("reminder_timezone", "text", (column) => column.defaultTo("Asia/Kolkata (IST)"))
    .addColumn("show_captions_by_default", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("preferred_caption_language", "text", (column) => column.notNull().defaultTo("English"))
    .addColumn("auto_scroll_transcript", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("highlight_transcript_line", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("open_current_section_auto", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("continue_next_incomplete_lecture", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("auto_move_next_section", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("keep_completed_lectures_visible", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("custom_prefs", "jsonb", (column) => column.defaultTo("{}"))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 4. user_notification_prefs table
  await database.schema
    .createTable("user_notification_prefs")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (column) => column.notNull().unique().references("users.id").onDelete("cascade"))
    .addColumn("in_app_notifications", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("email_digest", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("notif_course_updates", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("notif_discussion_replies", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("notif_learning_reminders", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("notif_milestones", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 5. user_security_settings table
  await database.schema
    .createTable("user_security_settings")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (column) => column.notNull().unique().references("users.id").onDelete("cascade"))
    .addColumn("two_factor_enabled", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("new_device_alerts", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("sign_in_alerts", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 6. config_audit_log table
  await database.schema
    .createTable("config_audit_log")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("changed_by", "uuid", (column) => column.notNull().references("users.id"))
    .addColumn("table_name", "text", (column) => column.notNull())
    .addColumn("record_id", "uuid", (column) => column.notNull())
    .addColumn("field_name", "text", (column) => column.notNull())
    .addColumn("old_value", "text")
    .addColumn("new_value", "text")
    .addColumn("changed_at", "timestamptz", (column) => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("config_audit_log").execute();
  await database.schema.dropTable("user_security_settings").execute();
  await database.schema.dropTable("user_notification_prefs").execute();
  await database.schema.dropTable("user_preferences").execute();
  await database.schema.dropTable("theme_presets").execute();
  await database.schema.dropTable("system_config").execute();
}
