export const BUILT_IN_PLAYER_THEME_IDS = [
  "youtube",
  "cone",
  "frost",
  "mono",
] as const;

export type BuiltInPlayerThemeId = (typeof BUILT_IN_PLAYER_THEME_IDS)[number];

export const DEFAULT_PLAYER_THEME_ID: BuiltInPlayerThemeId = "youtube";

/**
 * Ids a theme can have: the built-in ones and those a plugin registers
 * (`registerPlayerTheme`). Lower-case letters, digits and dashes.
 */
const PLAYER_THEME_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

export function isBuiltInPlayerThemeId(
  value: unknown,
): value is BuiltInPlayerThemeId {
  return (
    typeof value === "string" &&
    BUILT_IN_PLAYER_THEME_IDS.includes(value as BuiltInPlayerThemeId)
  );
}

/**
 * Whether `value` can name a theme, built in or registered by a plugin.
 * A stored choice is kept even while its plugin is not loaded (yet); the
 * player falls back to the default theme until it is.
 */
export function isPlayerThemeId(value: unknown): value is string {
  return typeof value === "string" && PLAYER_THEME_ID_PATTERN.test(value);
}
