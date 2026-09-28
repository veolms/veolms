export const BUILT_IN_PLAYER_THEME_IDS = [
  "youtube",
  "aurora",
  "minimal",
] as const;

export type BuiltInPlayerThemeId = (typeof BUILT_IN_PLAYER_THEME_IDS)[number];

export function isBuiltInPlayerThemeId(
  value: unknown,
): value is BuiltInPlayerThemeId {
  return (
    typeof value === "string" &&
    BUILT_IN_PLAYER_THEME_IDS.includes(value as BuiltInPlayerThemeId)
  );
}
