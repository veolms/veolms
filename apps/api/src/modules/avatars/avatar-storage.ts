import type { S3StorageService } from "@veolms/storage";

export const AVATAR_URL_PREFIX = "/api/v1/avatars";

/** Cap on a manually uploaded photo, enforced server-side (mirrors the
 * client-side check the settings page already does before it uploads). */
export const AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
/** Looser cap on what we'll download from a provider's own CDN. */
const PROVIDER_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 4_000;
export const AVATAR_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Every user has at most one avatar object, always at this same key — a
 * fresh upload or re-fetched provider photo simply overwrites it in place,
 * so "replace the existing avatar" never needs an explicit delete. */
export function avatarKey(userId: string): string {
  return `public/avatars/${userId}`;
}

/** Storage key used before media visibility namespaces were introduced. */
export function legacyAvatarKey(userId: string): string {
  return `avatars/${userId}`;
}

export function avatarPublicUrl(userId: string): string {
  return `${AVATAR_URL_PREFIX}/${encodeURIComponent(userId)}`;
}

export function isStoredAvatarUrl(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(`${AVATAR_URL_PREFIX}/`));
}

/** Stores raw avatar bytes (a manual upload) under the user's fixed R2 key. */
export async function storeAvatarBuffer(
  storage: S3StorageService,
  userId: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  await storage.putObject(avatarKey(userId), data, contentType, data.length);
  return avatarPublicUrl(userId);
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
 * Downloads a provider profile photo (Google/GitHub) and stores it under the
 * user's fixed R2 key. Returns null on any failure — callers fall back to
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

/** Deletes the user's stored avatar object. Used only when a profile moves
 * away from an R2-hosted avatar (e.g. onto a DiceBear pick), so the old
 * object doesn't linger as orphaned storage. */
export async function removeAvatar(
  storage: S3StorageService,
  userId: string,
): Promise<void> {
  await Promise.all(
    [avatarKey(userId), legacyAvatarKey(userId)].map((key) =>
      storage.deleteObject(key).catch(() => undefined),
    ),
  );
}
