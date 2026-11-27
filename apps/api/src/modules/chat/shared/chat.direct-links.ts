import { createHash } from "node:crypto";

import type { S3StorageService } from "@veolms/storage";

import { config } from "../../../config.ts";
import { getCdnDeliveryUrl } from "../../../services/cdn-delivery.ts";
import type { ChatRuntime } from "./chat.runtime.ts";

/** A token's window: the same link for one person for six hours. */
const WINDOW_SECONDS = 6 * 60 * 60;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UPLOAD_PATH = new RegExp(`^/v1/chat/uploads/(${UUID})$`, "i");
const ICON_PATH = new RegExp(`^/v1/chat/rooms/(${UUID})/icon(?:\\?|$)`, "i");

/** Chat files are in object storage (not on the API's disk in development). */
export function hasObjectStorage(): boolean {
  return Boolean(
    config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY,
  );
}

/** The course picture at avatar size: its 240 px copy, else the original. */
export function thumbnailKey(metadata: unknown, storageKey: string): string {
  const variants =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as { variants?: unknown }).variants
      : null;
  if (Array.isArray(variants)) {
    for (const width of [240, 320, 160, 480]) {
      const found = variants.find(
        (v): v is { key: string } =>
          Boolean(v) &&
          typeof v === "object" &&
          (v as { width?: unknown }).width === width &&
          typeof (v as { key?: unknown }).key === "string",
      );
      if (found?.key.trim()) return found.key.trim();
    }
  }
  return storageKey;
}

/**
 * When this person's token for the current window runs out. Each person's
 * windows start at their own offset: the CDN binds a token to the first
 * client that uses it, so two people must not get the same token for the
 * same file. Within a window the link stays the same, so the browser keeps
 * its copy. A token handed out has 6 to 12 hours left.
 */
export function chatTokenExpiry(userId: string, nowSeconds: number): number {
  const offset =
    createHash("sha256").update(userId).digest().readUInt32BE(0) %
    WINDOW_SECONDS;
  const windowStart =
    Math.floor((nowSeconds - offset) / WINDOW_SECONDS) * WINDOW_SECONDS +
    offset;
  return windowStart + 2 * WINDOW_SECONDS;
}

type Linkable = Record<string, unknown>;

/**
 * Adds CDN links next to the API paths of chat photos, videos, voice messages and group pictures in
 * an answer to one person: `directUrl` beside an attachment's `url`, and
 * `iconDirectUrl` beside a group's `iconUrl`. A photo then loads straight
 * from the CDN (`?t=` token, as video segments do) instead of through the
 * API and a redirect. The API paths stay, as the app's fallback.
 *
 * Only for answers already checked for this person: it signs the files
 * the answer names. Without object storage or a CDN the answer is
 * unchanged.
 */
export function createChatDirectLinks(
  runtime: Pick<ChatRuntime, "database" | "repository">,
  storage: S3StorageService,
) {
  const { database, repository } = runtime;

  /** The shared CDN link (a `?t=` token unless the key is public). */
  function tokenUrl(key: string, expiresAt: number): string | null {
    try {
      return getCdnDeliveryUrl(storage, key, { expiresAt }).url;
    } catch {
      // CDN not configured: the app keeps the API path.
      return null;
    }
  }

  /** Every object in the answer that names a chat file or group picture. */
  function collect(payload: unknown) {
    const files: Array<{ node: Linkable; uploadId: string }> = [];
    const icons: Array<{ node: Linkable; roomId: string }> = [];
    const seen = new Set<unknown>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      const node = value as Linkable;
      if (
        typeof node.url === "string" &&
        (node.kind === "image" ||
          node.kind === "video" ||
          node.kind === "audio")
      ) {
        const match = UPLOAD_PATH.exec(node.url);
        if (match) files.push({ node, uploadId: match[1]!.toLowerCase() });
      }
      if (typeof node.iconUrl === "string") {
        const match = ICON_PATH.exec(node.iconUrl);
        if (match) icons.push({ node, roomId: match[1]!.toLowerCase() });
      }
      for (const child of Object.values(node)) visit(child);
    };
    visit(payload);
    return { files, icons };
  }

  function collectCount(payload: unknown): number {
    const { files, icons } = collect(payload);
    return files.length + icons.length;
  }

  return {
    async forViewer<T>(userId: string, payload: T): Promise<T> {
      // No CDN address configured: nothing to link to.
      if (!hasObjectStorage() || !storage.getPublicObjectUrl("x")) {
        return payload;
      }
      if (collectCount(payload) === 0) return payload;
      // A copy: the answer may be shared (cached) with other people, and
      // the links are this person's own.
      payload = structuredClone(payload);
      const { files, icons } = collect(payload);

      const expiresAt = chatTokenExpiry(userId, Math.floor(Date.now() / 1000));
      const [uploads, sources] = await Promise.all([
        repository.uploadStorageKeys(database, [
          ...new Set(files.map((f) => f.uploadId)),
        ]),
        repository.roomIconSources(database, [
          ...new Set(icons.map((i) => i.roomId)),
        ]),
      ]);

      const fileLinks = new Map<string, string>();
      for (const upload of uploads) {
        const url = tokenUrl(upload.storage_key, expiresAt);
        if (url) fileLinks.set(upload.id, url);
      }
      for (const { node, uploadId } of files) {
        const url = fileLinks.get(uploadId);
        if (url) node.directUrl = url;
      }

      const iconLinks = new Map<string, string>();
      for (const source of sources) {
        if (source.kind === "direct") continue;
        let url: string | null = null;
        if (source.icon_upload_id) {
          url = source.icon_storage_key
            ? tokenUrl(source.icon_storage_key, expiresAt)
            : null;
        } else if (source.media_storage_key && source.media_id) {
          // As GET /chat/rooms/:id/icon: a public picture's 240 px copy, or
          // a private one through a token.
          const isPublic = !source.media_storage_key
            .replace(/^\/+/, "")
            .startsWith("protected/");
          url = tokenUrl(
            isPublic
              ? `public/thumbnails/${source.media_id}/240.webp`
              : thumbnailKey(source.media_metadata, source.media_storage_key),
            expiresAt,
          );
        } else {
          const stored = source.thumbnail_url?.trim();
          if (stored && /^https?:\/\//.test(stored)) url = stored;
        }
        if (url) iconLinks.set(source.id, url);
      }
      for (const { node, roomId } of icons) {
        const url = iconLinks.get(roomId);
        if (url) node.iconDirectUrl = url;
      }
      return payload;
    },
  };
}

export type ChatDirectLinks = ReturnType<typeof createChatDirectLinks>;

/** A plain answer (object or array), not a reply, stream or Buffer. */
function isPlainAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Every handler of a chat controller, with CDN links added to its answer
 * for the signed-in person (see `forViewer`): a message just sent or
 * edited, a group just changed, a staff list. Answers that are not plain
 * data (a reply already sent, a stream) pass through unchanged.
 */
export function withChatDirectLinks<
  T extends Record<string, (...args: never[]) => unknown>,
>(controller: T, links: ChatDirectLinks): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(controller)) {
    wrapped[name] = async function (
      this: unknown,
      request: { user?: { id: string } | null },
      ...rest: unknown[]
    ) {
      const answer = await (handler as (...args: unknown[]) => unknown).call(
        this,
        request,
        ...rest,
      );
      const userId = request?.user?.id;
      return userId && isPlainAnswer(answer)
        ? links.forViewer(userId, answer)
        : answer;
    };
  }
  return wrapped as T;
}
