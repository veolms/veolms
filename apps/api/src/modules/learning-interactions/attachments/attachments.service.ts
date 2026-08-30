import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AttachmentKind,
  LearningUploadResponse,
  LinkPreviewResponse,
} from "@veolms/contracts";
import type { AttachmentsRepository } from "./attachments.repository.ts";

export interface AttachmentsService {
  processUpload(
    db: DatabaseExecutor,
    file: {
      filename: string;
      mimetype: string;
      data: Buffer;
    },
  ): Promise<LearningUploadResponse>;

  fetchLinkPreview(url: string): Promise<LinkPreviewResponse>;
}

export function createAttachmentsService(
  attachmentsRepo: AttachmentsRepository,
): AttachmentsService {
  function getAttachmentKind(mimetype: string, filename: string): AttachmentKind {
    if (mimetype.startsWith("image/")) {
      if (filename.toLowerCase().includes("screenshot")) return "screenshot";
      return "image";
    }
    const codeExtensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".rs",
      ".go",
      ".java",
      ".cpp",
      ".c",
      ".html",
      ".css",
      ".json",
      ".sql",
      ".sh",
    ];
    const ext = path.extname(filename).toLowerCase();
    if (codeExtensions.includes(ext)) {
      return "code";
    }
    return "document";
  }

  function getMediaType(kind: AttachmentKind, mimetype: string) {
    if (mimetype.startsWith("video/")) return "video";
    if (kind === "image" || kind === "screenshot") return "image";
    if (kind === "code") return "code";
    return "document";
  }

  return {
    async processUpload(db, file) {
      const id = crypto.randomUUID();
      const ext = path.extname(file.filename) || ".bin";
      const sanitizedName = `${id}${ext}`;
      const kind = getAttachmentKind(file.mimetype, file.filename);
      const mediaType = getMediaType(kind, file.mimetype);

      const uploadsDir = path.resolve(process.cwd(), "tmp", "discussion-uploads");
      await fs.mkdir(uploadsDir, { recursive: true });
      const targetFilePath = path.join(uploadsDir, sanitizedName);
      await fs.writeFile(targetFilePath, file.data);

      const fileUrl = `/api/v1/dev/discussion-uploads/${sanitizedName}`;

      await attachmentsRepo.createAttachment(db, {
        id,
        kind,
        fileName: file.filename,
        fileUrl,
        mimeType: file.mimetype,
        fileSize: file.data.length,
      });

      return {
        id,
        url: fileUrl,
        fileName: file.filename,
        kind,
        mediaType,
        mimeType: file.mimetype,
        size: file.data.length,
      };
    },

    async fetchLinkPreview(url: string) {
      try {
        const parsed = new URL(url);
        return {
          url,
          title: parsed.hostname,
          description: `Resource from ${parsed.hostname}`,
          siteName: parsed.hostname,
          imageUrl: null,
        };
      } catch {
        return {
          url,
          title: null,
          description: null,
          siteName: null,
          imageUrl: null,
        };
      }
    },
  };
}
