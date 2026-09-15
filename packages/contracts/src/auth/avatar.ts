/**
 * Helpers for DiceBear's public HTTP API
 * (https://www.dicebear.com/how-to-use/http-api/). No authentication is
 * required, so both the browser (style picker previews) and the server
 * (default avatar generated at signup) call the same endpoint shape.
 */
export const DICEBEAR_BASE_URL = "https://api.dicebear.com/10.x";

/**
 * Small curated subset of DiceBear's styles, good enough for a profile
 * picture picker without listing every style the API supports.
 */
export const AVATAR_STYLES = [
  "lorelei",
  "notionists",
  "adventurer",
  "micah",
  "bottts",
  "pixel-art",
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number];

/** Style used for the deterministic avatar generated automatically at signup. */
export const DEFAULT_AVATAR_STYLE: AvatarStyle = AVATAR_STYLES[0];

/**
 * Builds the SVG endpoint URL for a given style + seed. The seed is
 * URL-encoded since it may contain characters DiceBear doesn't expect
 * (e.g. a shuffled seed like "<userId>-3").
 */
export function buildDicebearSvgUrl(style: AvatarStyle, seed: string): string {
  return `${DICEBEAR_BASE_URL}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}
