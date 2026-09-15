import type { AttachmentUploadState } from "../../services/learning-interactions";

export interface DiscussionAttachmentItem {
  id: string;
  clientId?: string;
  serverId?: string;
  fileName: string;
  fileUrl?: string;
  localPreviewUrl?: string;
  mimeType: string;
  fileSize: number;
  kind?: "image" | "screenshot" | "code" | "document";
  mediaType?: "image" | "video" | "code" | "document";
  uploadState?: AttachmentUploadState;
  uploadProgress?: number;
  metadata?: unknown;
}

export type AttachmentVisualItem = Pick<
  DiscussionAttachmentItem,
  | "id"
  | "clientId"
  | "fileName"
  | "fileUrl"
  | "localPreviewUrl"
  | "mimeType"
  | "fileSize"
  | "kind"
  | "mediaType"
  | "uploadState"
  | "uploadProgress"
>;

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function getAttachmentCategory(
  mimeType: string,
  kind?: string,
): "image" | "video" | "code" | "document" {
  if (
    mimeType.startsWith("image/") ||
    kind === "image" ||
    kind === "screenshot"
  ) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (
    mimeType === "application/json" ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    kind === "code"
  ) {
    return "code";
  }
  return "document";
}

export function getAttachmentVisualUrl(
  attachment: AttachmentVisualItem,
): string | undefined {
  return attachment.localPreviewUrl ?? attachment.fileUrl;
}
