import { AVATAR_STYLES, DICEBEAR_BASE_URL } from "@veolms/contracts";

import { displayAvatarUrl, isStoredAvatarUrl } from "./avatar-storage.ts";

/**
 * Pictures a phone draws in a notification (Android chat pushes): it
 * fetches them natively, with no cookie and no redirects, and can decode
 * only PNG, JPEG and WebP. Anything else is left out, and the app draws a
 * letter instead.
 */
const PUSH_PICTURE_EXTENSION = /\.(?:png|jpe?g|webp)$/iu;

/** Long enough for any real CDN key; keeps a push well under FCM's 4 KB. */
const PUSH_PICTURE_MAX_LENGTH = 512;

/** DiceBear's PNG is 128 px by default; asked for explicitly to stay so. */
const DICEBEAR_PUSH_SIZE = 128;

const escapedDicebearBase = DICEBEAR_BASE_URL.replace(
  /[.*+?^$()|[\]{}\\/]/gu,
  "\\$&",
);
/** How a DiceBear default is stored (`buildDicebearSvgUrl`). */
const DICEBEAR_SVG_URL = new RegExp(
  "^" + escapedDicebearBase + "/([a-z-]+)/svg\\?seed=([^&#]*)$",
  "u",
);

/**
 * A complete URL a phone can fetch and draw as-is, or null. Accepts only
 * absolute http(s) URLs (production's CDN is https; a local store may be
 * http) whose path ends in a PNG, JPEG or WebP file.
 */
export function pushPictureUrl(
  value: string | null | undefined,
): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > PUSH_PICTURE_MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!PUSH_PICTURE_EXTENSION.test(url.pathname) && !isDicebearPng(url)) {
    return null;
  }
  return candidate;
}

function isDicebearPng(url: URL): boolean {
  return (
    `${url.origin}${url.pathname}`.startsWith(`${DICEBEAR_BASE_URL}/`) &&
    url.pathname.endsWith("/png")
  );
}

/**
 * A profile picture as a phone can draw it: the stored photo's URL as the
 * API shows it everywhere (a Google photo's original), or a DiceBear
 * default as DiceBear's PNG of the same picture (the stored one is SVG).
 */
export function avatarPushUrl(
  avatarUrl: string | null | undefined,
): string | null {
  const value = avatarUrl?.trim();
  if (!value) return null;
  const dicebear = DICEBEAR_SVG_URL.exec(value);
  if (dicebear) {
    const style = dicebear[1]!;
    if (!(AVATAR_STYLES as readonly string[]).includes(style)) return null;
    return pushPictureUrl(
      `${DICEBEAR_BASE_URL}/${style}/png?seed=${dicebear[2]}&size=${DICEBEAR_PUSH_SIZE}`,
    );
  }
  if (!isStoredAvatarUrl(value)) return null;
  return pushPictureUrl(displayAvatarUrl(value));
}
