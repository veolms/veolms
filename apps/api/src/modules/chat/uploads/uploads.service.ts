import { join } from "node:path";
import type { Readable } from "node:stream";

import {
  CHAT_RESTORE_DAYS,
  CHAT_UPLOAD_DAILY_BYTES,
  CHAT_UPLOAD_MAX_BYTES,
  CHAT_UPLOAD_MIME_TYPES,
  type ChatAttachment,
  type ChatUploadKind,
} from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";

import { config } from "../../../config.ts";
import { createDiscussionUploadStore } from "../../discussion-uploads/discussion-upload.storage.ts";
import type { MessagesService } from "../messages/messages.service.ts";
import { ROLE_LEVEL } from "../shared/chat.access.ts";
import { ChatErrors } from "../shared/chat.errors.ts";
import { chatUploadUrl } from "../shared/chat.presenters.ts";
import { createRoomViews } from "../shared/chat.room-views.ts";
import type { ChatRuntime } from "../shared/chat.runtime.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const PUT_EXPIRES_SECONDS = 15 * 60;
/** Read links expire on 6-hour boundaries so the same URL repeats (cacheable). */
const READ_BUCKET_SECONDS = 6 * 60 * 60;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/webm": ".weba",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/aac": ".aac",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/markdown": ".md",
  "application/json": ".json",
};

/** The course picture at avatar size: its 240 px copy, else the original. */
function thumbnailKey(metadata: unknown, storageKey: string): string {
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

const DAY_SECONDS = 24 * 60 * 60;

/** Documents the chat previews in the page (never HTML or scripts). */
const PREVIEWABLE_DOCUMENTS = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

function hasObjectStorage(): boolean {
  return Boolean(
    config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY,
  );
}

/** Strips codec parameters ("audio/webm;codecs=opus" → "audio/webm"). */
function baseMime(mimeType: string): string {
  return mimeType.split(";")[0]!.trim().toLowerCase();
}

/**
 * Photos, videos, voice messages and documents (CHAT_ROOM_PLAN.md §14.6).
 * The browser uploads straight to object storage with a presigned PUT
 * (type and size bound into the signature); the API never handles the
 * bytes in production. Without object storage (local development) the file
 * is streamed to the API's disk instead.
 *
 * Reading checks chat access, then redirects to a signed URL whose expiry
 * is rounded to 6-hour buckets so browsers can cache it.
 */
export function createUploadsService(
  runtime: ChatRuntime,
  messages: MessagesService,
  storage: S3StorageService,
) {
  const { database, repository } = runtime;
  const views = createRoomViews(runtime);
  const diskStore = createDiscussionUploadStore(storage, {
    objectPrefix: "protected/chat",
    diskDirectory: join(process.cwd(), ".data", "chat-uploads"),
  });

  /** A short-lived link, on 6-hour boundaries so browsers can cache it. */
  async function signedRedirect(key: string, disposition?: string) {
    const now = Math.floor(Date.now() / 1000);
    const bucketEnd =
      Math.ceil((now + 60) / READ_BUCKET_SECONDS) * READ_BUCKET_SECONDS +
      READ_BUCKET_SECONDS;
    const expiresIn = bucketEnd - now;
    const url = await storage.getPresignedGetUrl(
      key,
      expiresIn,
      disposition ? { responseContentDisposition: disposition } : undefined,
    );
    return {
      kind: "redirect" as const,
      url,
      maxAge: Math.max(60, expiresIn - READ_BUCKET_SECONDS),
    };
  }

  function diskName(upload: { id: string; mime_type: string }) {
    return `${upload.id}${EXTENSIONS[upload.mime_type] ?? ".bin"}`;
  }

  function present(upload: {
    id: string;
    kind: ChatUploadKind;
    file_name: string;
    mime_type: string;
    size_bytes: string | number;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
    waveform: number[] | null;
  }): ChatAttachment {
    return {
      id: upload.id,
      kind: upload.kind,
      name: upload.file_name,
      mimeType: upload.mime_type,
      size: Number(upload.size_bytes),
      width: upload.width,
      height: upload.height,
      durationMs: upload.duration_ms,
      waveform: upload.waveform,
      url: chatUploadUrl(upload.id),
    };
  }

  return {
    async create(
      userId: string,
      roomId: string,
      input: {
        kind: ChatUploadKind;
        name: string;
        mimeType: string;
        size: number;
        width?: number | undefined;
        height?: number | undefined;
        durationMs?: number | undefined;
        waveform?: number[] | undefined;
      },
    ) {
      const ctx = await messages.assertCanPostIn(userId, roomId);
      if (!ctx.room.attachments_allowed && !ctx.canModerate) {
        throw ChatErrors.attachmentsOff();
      }
      const mimeType = baseMime(input.mimeType);
      const allowed = CHAT_UPLOAD_MIME_TYPES[input.kind] as readonly string[];
      if (!allowed.includes(mimeType)) throw ChatErrors.uploadType();
      const max = CHAT_UPLOAD_MAX_BYTES[input.kind];
      if (input.size > max) throw ChatErrors.uploadTooBig(max);

      if (ROLE_LEVEL[ctx.role] < ROLE_LEVEL.staff) {
        const used = await repository.uploadedBytesSince(
          database,
          userId,
          new Date(Date.now() - DAY_MS),
        );
        if (used + input.size > CHAT_UPLOAD_DAILY_BYTES) {
          throw ChatErrors.uploadQuota();
        }
      }

      const id = crypto.randomUUID();
      const month = new Date().toISOString().slice(0, 7);
      // A month prefix lets a storage lifecycle rule expire old chat files.
      const storageKey = `protected/chat/${month}/${roomId}/${id}${EXTENSIONS[mimeType] ?? ".bin"}`;
      const name = input.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200);
      await repository.insertUpload(database, {
        id,
        owner_id: userId,
        room_id: roomId,
        kind: input.kind,
        mime_type: mimeType,
        file_name: name,
        size_bytes: input.size,
        width: input.width ?? null,
        height: input.height ?? null,
        duration_ms: input.durationMs ?? null,
        waveform: input.waveform ?? null,
        storage_key: storageKey,
      });

      if (!hasObjectStorage()) {
        return {
          uploadId: id,
          uploadUrl: `/v1/chat/uploads/${id}/content`,
          headers: { "Content-Type": mimeType },
          viaApi: true,
        };
      }
      const uploadUrl = await storage.getPresignedPutUrl(
        storageKey,
        mimeType,
        input.size,
        PUT_EXPIRES_SECONDS,
        { bindContentType: true },
      );
      return {
        uploadId: id,
        uploadUrl,
        headers: { "Content-Type": mimeType },
        viaApi: false,
      };
    },

    /** Development only: the bytes come to the API when there is no object storage. */
    async putContent(userId: string, uploadId: string, stream: Readable) {
      if (hasObjectStorage()) throw ChatErrors.uploadNotFound();
      const upload = await repository.findUpload(database, uploadId);
      if (
        !upload ||
        upload.owner_id !== userId ||
        upload.status !== "pending"
      ) {
        throw ChatErrors.uploadNotFound();
      }
      const stored = await diskStore.putNamedFromStream({
        fileName: diskName(upload),
        mimeType: upload.mime_type,
        stream,
      });
      if (stored.size !== Number(upload.size_bytes)) {
        await diskStore.remove(diskName(upload));
        throw ChatErrors.uploadMismatch();
      }
      return { ok: true as const };
    },

    /** Checks what storage holds against what was announced, then marks it ready. */
    async complete(userId: string, uploadId: string) {
      const upload = await repository.findUpload(database, uploadId);
      if (!upload || upload.owner_id !== userId)
        throw ChatErrors.uploadNotFound();
      if (upload.status === "pending") {
        if (hasObjectStorage()) {
          const head = await storage.headObject(upload.storage_key);
          if (
            !head ||
            head.contentLength !== Number(upload.size_bytes) ||
            baseMime(head.contentType ?? "") !== upload.mime_type
          ) {
            throw ChatErrors.uploadMismatch();
          }
        } else if (!(await diskStore.get(diskName(upload)))) {
          throw ChatErrors.uploadNotReady();
        }
        await repository.markUploadReady(database, uploadId);
      }
      return { attachment: present(upload) };
    },

    /**
     * Where to read a file: a signed URL (object storage) or the file itself
     * (development). Only for people who can read the chat, and never for a
     * deleted message's files.
     */
    async read(userId: string, uploadId: string, download: boolean) {
      const upload = await repository.findUpload(database, uploadId);
      if (!upload) throw ChatErrors.uploadNotFound();
      if (upload.status !== "attached" && upload.owner_id !== userId) {
        throw ChatErrors.uploadNotFound();
      }
      const ctx = await views.assertCanRead(database, userId, upload.room_id);
      if (upload.message_seq !== null) {
        const message = await repository.findMessage(
          database,
          upload.room_id,
          Number(upload.message_seq),
        );
        if (!message) throw ChatErrors.uploadNotFound();
        // A deleted message's files: only group admins, while it can still
        // be restored.
        if (
          message.deleted_at !== null &&
          (!ctx.canModerate ||
            message.deleted_reason !== "admin" ||
            Date.now() - message.deleted_at.getTime() >
              CHAT_RESTORE_DAYS * DAY_MS)
        ) {
          throw ChatErrors.uploadNotFound();
        }
      }
      // Shown in the page: photos, videos, voice, and documents the app can
      // preview (PDF, plain text, Markdown, CSV, JSON). Everything else is
      // only ever downloaded.
      const inline =
        !download &&
        (upload.kind === "image" ||
          upload.kind === "video" ||
          upload.kind === "audio" ||
          PREVIEWABLE_DOCUMENTS.has(upload.mime_type));
      const disposition = `${inline ? "inline" : "attachment"}; filename="${upload.file_name.replace(/[^\x20-\x7e]/g, "_")}"`;

      if (!hasObjectStorage()) {
        const file = await diskStore.get(diskName(upload));
        if (!file) throw ChatErrors.uploadNotFound();
        return {
          kind: "stream" as const,
          stream: file.stream,
          mimeType: upload.mime_type,
          size: file.size,
          disposition,
        };
      }
      return signedRedirect(upload.storage_key, disposition);
    },

    /**
     * A group's picture, for anyone who can read the group: the icon its
     * admins set, else the course's picture (a public copy from the CDN, or
     * a signed link when the course's files are private, as for a course
     * that is not published).
     */
    async icon(userId: string, roomId: string) {
      await views.assertCanRead(database, userId, roomId);
      const source = await repository.roomIconSource(database, roomId);
      if (!source || source.kind === "direct")
        throw ChatErrors.uploadNotFound();
      if (source.icon_upload_id) {
        return this.read(userId, source.icon_upload_id, false);
      }
      if (source.media_storage_key && source.media_id) {
        // A public picture: its 240 px copy, made for every course picture
        // and shown the same way on the course pages (about 8 KB, where the
        // original can be half a megabyte). A private one: the size its
        // record lists, else the original, through a signed link.
        const isPublic = !source.media_storage_key
          .replace(/^\/+/, "")
          .startsWith("protected/");
        const key = isPublic
          ? `public/thumbnails/${source.media_id}/240.webp`
          : thumbnailKey(source.media_metadata, source.media_storage_key);
        const publicUrl =
          isPublic && storage.isCdnPublicKey(key)
            ? storage.getPublicObjectUrl(key)
            : null;
        if (publicUrl && /^https?:\/\//.test(publicUrl)) {
          return {
            kind: "redirect" as const,
            url: publicUrl,
            maxAge: DAY_SECONDS,
          };
        }
        if (hasObjectStorage()) return signedRedirect(key);
      }
      const stored = source.thumbnail_url?.trim();
      if (stored && /^https?:\/\//.test(stored)) {
        return { kind: "redirect" as const, url: stored, maxAge: DAY_SECONDS };
      }
      throw ChatErrors.uploadNotFound();
    },

    /** Removes files nobody can read any more (retention job). */
    async purge(limit = 500) {
      const rows = await repository.listRemovableUploads(
        database,
        new Date(Date.now() - DAY_MS),
        new Date(Date.now() - CHAT_RESTORE_DAYS * DAY_MS),
        limit,
      );
      if (rows.length === 0) return 0;
      if (hasObjectStorage()) {
        await storage.deleteObjects(rows.map((row) => row.storage_key));
      } else {
        for (const row of rows) {
          const upload = await repository.findUpload(database, row.id);
          if (upload) await diskStore.remove(diskName(upload));
        }
      }
      await repository.deleteUploads(
        database,
        rows.map((row) => row.id),
      );
      return rows.length;
    },
  };
}

export type UploadsService = ReturnType<typeof createUploadsService>;
