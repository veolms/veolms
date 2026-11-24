import type {
  DeleteStorageFilesResponse,
  StorageFile,
  StorageFileKind,
  StorageFileSort,
  StorageFileSource,
  StorageFilesResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

import type { AppServices } from "../../services/index.ts";
import { createChatOwnFiles } from "../chat/index.ts";
import { createDiscussionUploadStore } from "../discussion-uploads/index.ts";
import {
  createAttachmentsRepository,
  createAttachmentsService,
} from "../learning/discussions/index.ts";
import { createSupportService } from "../support/support.service.ts";
import { fileMatchesSearch } from "./file-search.ts";
import {
  createStorageRepository,
  type OwnFileRow,
} from "./storage.repository.ts";

const KINDS: readonly StorageFileKind[] = ["image", "video", "audio", "file"];

/** Where the web app reads a file, with the session cookie. */
function urlOf(row: OwnFileRow): string | null {
  if (row.unsent) return null;
  switch (row.source) {
    case "chat":
      return `/v1/chat/uploads/${row.id}`;
    case "support":
      return `/v1/support/attachments/${row.id}`;
    default:
      return row.file_url || null;
  }
}

function present(row: OwnFileRow): StorageFile {
  return {
    source: row.source,
    id: row.id,
    kind: row.kind,
    name: row.name,
    mimeType: row.mime_type,
    size: Number(row.size),
    createdAt: row.created_at.toISOString(),
    place: row.place,
    unsent: row.unsent,
    url: urlOf(row),
    durationMs: row.duration_ms,
  };
}

/**
 * A learner's own files (Chats > Settings > Storage, Settings > Learning):
 * the list, and deleting one or many to free space at once. Each module
 * deletes its own kind, the way it shows them afterwards:
 * - chat: the message stays and shows "This file was deleted" (as WhatsApp
 *   does); the stored file goes with the retention job, unless a forwarded
 *   copy still uses it;
 * - discussions and notes: the attachment leaves the post;
 * - support: the attachment leaves the ticket.
 */
export function createMyFilesService({
  app,
  database,
  services,
}: {
  app: FastifyInstance;
  database: Kysely<Database>;
  services: AppServices;
}) {
  const repository = createStorageRepository();
  const chat = createChatOwnFiles(app, database);
  const discussions = createAttachmentsService(
    createAttachmentsRepository(),
    createDiscussionUploadStore(services.storage),
    services.storage,
  );
  const support = createSupportService({ database, services });

  async function usedBytes(userId: string) {
    const parts = await repository.breakdown(database, userId);
    return parts.chatBytes + parts.discussionBytes + parts.supportBytes;
  }

  return {
    async list(
      userId: string,
      query: {
        sort: StorageFileSort;
        kind?: StorageFileKind | undefined;
        q?: string | undefined;
        offset: number;
        limit: number;
      },
    ): Promise<StorageFilesResponse> {
      const search = query.q?.trim() ?? "";
      if (search) {
        // Every file, in order, matched here with the app's search rule
        // (typos, any order); the counts are of the files found.
        const { rows } = await repository.listOwnFiles(database, userId, {
          sort: query.sort,
          kind: undefined,
          limit: null,
          offset: 0,
        });
        const found = rows.filter((row) => fileMatchesSearch(search, row));
        const shown = query.kind
          ? found.filter((row) => row.kind === query.kind)
          : found;
        return {
          files: shown
            .slice(query.offset, query.offset + query.limit)
            .map(present),
          total: shown.length,
          totalBytes: shown.reduce((sum, row) => sum + Number(row.size), 0),
          kinds: KINDS.map((kind) => {
            const ofKind = found.filter((row) => row.kind === kind);
            return {
              kind,
              count: ofKind.length,
              bytes: ofKind.reduce((sum, row) => sum + Number(row.size), 0),
            };
          }),
        };
      }
      const { rows, kinds } = await repository.listOwnFiles(database, userId, {
        sort: query.sort,
        kind: query.kind,
        limit: query.limit,
        offset: query.offset,
      });
      const first = rows[0];
      return {
        files: rows.map(present),
        total: Number(first?.total ?? 0),
        totalBytes: Number(first?.total_bytes ?? 0),
        kinds: KINDS.map((kind) => {
          const row = kinds.find((entry) => entry.kind === kind);
          return {
            kind,
            count: Number(row?.count ?? 0),
            bytes: Number(row?.bytes ?? 0),
          };
        }),
      };
    },

    /** Only the person's own files are deleted; others are skipped. */
    async remove(
      userId: string,
      files: ReadonlyArray<{ source: StorageFileSource; id: string }>,
    ): Promise<DeleteStorageFilesResponse> {
      const ids = (source: StorageFileSource) => [
        ...new Set(
          files.filter((file) => file.source === source).map((f) => f.id),
        ),
      ];
      const before = await usedBytes(userId);
      const [chatIds, discussionIds, supportIds] = await Promise.all([
        ids("chat").length > 0 ? chat.remove(userId, ids("chat")) : [],
        ids("discussion").length > 0
          ? discussions.removeOwnAttachments(
              database,
              userId,
              ids("discussion"),
            )
          : [],
        ids("support").length > 0
          ? support.removeOwnAttachments(userId, ids("support"))
          : [],
      ]);
      const after = await usedBytes(userId);
      return {
        deleted: chatIds.length + discussionIds.length + supportIds.length,
        freedBytes: Math.max(0, before - after),
      };
    },
  };
}

export type MyFilesService = ReturnType<typeof createMyFilesService>;
