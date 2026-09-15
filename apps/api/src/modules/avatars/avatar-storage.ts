import type { AvatarImageVariant } from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";

/** Cap on a manually uploaded photo, enforced server-side (mirrors the
 * client-side check the settings page already does before it uploads). */
export const AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
/** Looser cap on what we'll download from a provider's own CDN. */
const PROVIDER_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 4_000;
export const AVATAR_IMAGE_WIDTHS = [45, 96, 160] as const;
const AVATAR_ORIGINAL_EXTENSIONS = ["jpg", "png", "webp", "gif"] as const;
export const AVATAR_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function avatarPrefix(userId: string): string {
  return `public/avatars/${userId}`;
}

function avatarVariantKey(userId: string, width: number): string {
  return `${avatarPrefix(userId)}/${width}.webp`;
}

export function avatarOriginalKey(userId: string, contentType: string): string {
  const extension =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/png"
        ? "png"
        : contentType === "image/gif"
          ? "gif"
          : "webp";
  return `${avatarPrefix(userId)}/original.${extension}`;
}

export function avatarCdnUrl(
  storage: S3StorageService,
  userId: string,
  width: (typeof AVATAR_IMAGE_WIDTHS)[number] = 160,
): string | null {
  return storage.getPublicObjectUrl(avatarVariantKey(userId, width));
}

/** Keeps one current original when a user changes image file extensions. */
export async function removeOtherAvatarOriginals(
  storage: S3StorageService,
  userId: string,
  contentType: string,
): Promise<void> {
  const currentKey = avatarOriginalKey(userId, contentType);
  await Promise.all(
    AVATAR_ORIGINAL_EXTENSIONS.map((extension) => {
      const key = `${avatarPrefix(userId)}/original.${extension}`;
      return key === currentKey
        ? Promise.resolve()
        : storage.deleteObject(key).catch(() => undefined);
    }),
  );
}

const AVATAR_VARIANT_URL_PATTERN =
  /^(.*\/public\/avatars\/[A-Za-z0-9_-]{1,200})\/(?:45|96|160)\.webp([?#].*)?$/u;

export function isStoredAvatarUrl(value: string | null | undefined): boolean {
  return Boolean(value && AVATAR_VARIANT_URL_PATTERN.test(value));
}

/** Builds the responsive source set for the canonical 160px CDN URL. */
export function avatarSrcSetFromUrl(
  value: string | null | undefined,
): AvatarImageVariant[] {
  if (!value) return [];
  const match = AVATAR_VARIANT_URL_PATTERN.exec(value);
  if (!match) return [];

  const suffix = match[2] ?? "";
  return AVATAR_IMAGE_WIDTHS.map((width) => ({
    url: `${match[1]}/${width}.webp${suffix}`,
    width,
    height: width,
  }));
}

/**
 * Stores the uploaded original. The CDN/image-transform Worker creates and
 * caches the requested WebP variants below this same user prefix:
 *
 * public/avatars/{userId}/original.{extension}
 * public/avatars/{userId}/{width}.webp
 *
 * The database keeps the CDN URL for the 160px variant so browsers never
 * download the original. Replacing the original intentionally reuses these
 * stable paths; the Worker controls the short avatar cache window.
 */
export async function storeAvatarBuffer(
  storage: S3StorageService,
  userId: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const originalKey = avatarOriginalKey(userId, contentType);
  await storage.putObject(originalKey, data, contentType, data.length);
  await removeOtherAvatarOriginals(storage, userId, contentType);

  const avatarUrl = avatarCdnUrl(storage, userId);
  if (!avatarUrl) {
    await storage.deleteObject(originalKey).catch(() => undefined);
    throw new Error("A public CDN URL is required to serve profile avatars.");
  }

  return avatarUrl;
}

export function detectImageContentType(
  buffer: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const ALLOWED_AVATAR_HOST_SUFFIXES = [
  "googleusercontent.com",
  "githubusercontent.com",
  "google.com",
  "github.com",
];

export function isAllowedAvatarHost(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_AVATAR_HOST_SUFFIXES.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

const MAX_REDIRECTS = 3;

async function fetchWithRedirectValidation(
  initialUrl: string,
  signal: AbortSignal,
): Promise<Response | null> {
  let currentUrl = initialUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isAllowedAvatarHost(currentUrl)) {
      return null;
    }
    const response = await fetch(currentUrl, {
      signal,
      redirect: "manual",
    });

    if (
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307 ||
      response.status === 308
    ) {
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        currentUrl = new URL(location, currentUrl).href;
      } catch {
        return null;
      }
      continue;
    }

    return response;
  }
  return null;
}

/**
 * Downloads a provider profile photo (Google/GitHub) and stores its original
 * bytes for the CDN/image-transform Worker. Returns null on any failure — callers fall back to
 * the DiceBear default rather than blocking login or signup on this.
 */
export async function storeAvatarFromUrl(
  storage: S3StorageService,
  userId: string,
  sourceUrl: string,
): Promise<string | null> {
  try {
    const response = await fetchWithRedirectValidation(
      sourceUrl,
      AbortSignal.timeout(FETCH_TIMEOUT_MS),
    );
    if (!response || !response.ok) return null;

    const contentTypeHeader =
      response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!AVATAR_CONTENT_TYPES.has(contentTypeHeader)) return null;

    if (!response.body) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > PROVIDER_FETCH_MAX_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }

    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      return null;
    }

    const detectedType = detectImageContentType(buffer);
    if (!detectedType) {
      return null;
    }

    return storeAvatarBuffer(storage, userId, buffer, detectedType);
  } catch {
    return null;
  }
}

/** Deletes the user's stored original and any CDN-generated variants. */
export async function removeAvatar(
  storage: S3StorageService,
  userId: string,
): Promise<void> {
  await storage.deletePrefix(`${avatarPrefix(userId)}/`).catch(() => undefined);
}
