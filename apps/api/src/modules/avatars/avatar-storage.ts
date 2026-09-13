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
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!AVATAR_CONTENT_TYPES.has(contentType)) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > PROVIDER_FETCH_MAX_BYTES) {
      return null;
    }

    return storeAvatarBuffer(storage, userId, buffer, contentType);
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
  await storage.deleteObject(avatarKey(userId)).catch(() => undefined);
}
