import type { LessonResource } from "@veolms/contracts";

export interface LessonResourceItem {
  id: string;
  name: string;
  type: string;
  size: string;
  mediaAssetId: string;
  mimeType?: string;
  sizeBytes?: number;
  status?: "uploading" | "uploaded" | "processing" | "ready" | "failed";
}

export function toLessonResourceItem(
  resource: LessonResource,
  fallbackFile?: File,
): LessonResourceItem {
  const filename =
    resource.mediaAsset?.originalFilename ||
    fallbackFile?.name ||
    resource.title;
  const mimeType = resource.mediaAsset?.mimeType || fallbackFile?.type;
  const sizeBytes = resource.mediaAsset?.sizeBytes ?? fallbackFile?.size;

  return {
    id: resource.id,
    name: resource.title || filename,
    type: getResourceType(filename, mimeType),
    size: formatFileSize(sizeBytes),
    mediaAssetId: resource.mediaAssetId,
    mimeType,
    sizeBytes,
    status: resource.mediaAsset?.status,
  };
}

function getResourceType(filename: string, mimeType?: string): string {
  const extension = filename.split(".").pop()?.trim().toUpperCase();
  if (
    extension &&
    extension !== filename.toUpperCase() &&
    extension.length <= 8
  ) {
    return extension === "JPEG" ? "JPG" : extension;
  }

  const subtype = mimeType?.split("/").pop()?.trim().toUpperCase();
  return subtype && subtype.length <= 8 ? subtype : "FILE";
}

function formatFileSize(sizeBytes?: number): string {
  if (sizeBytes === undefined || !Number.isFinite(sizeBytes)) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;

  const units = ["KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = -1;
  do {
    size /= 1024;
    unitIndex += 1;
  } while (size >= 1024 && unitIndex < units.length - 1);

  const rounded = size >= 10 ? Math.round(size) : Number(size.toFixed(1));
  return `${rounded} ${units[unitIndex]}`;
}
