import type { LearningThreadAttachmentSummary } from "@veolms/contracts";

export type AttachmentUploadState =
  | "local"
  | "uploading"
  | "confirmed"
  | "failed";

export interface LocalComposerAttachment {
  /** Stable UI identity. This is never sent to the API. */
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: LearningThreadAttachmentSummary["kind"];
  mediaType: "image" | "video" | "code" | "document";
  localPreviewUrl?: string;
}

/**
 * A linked attachment augmented with transient frontend presentation state.
 * `id`/`clientId` stay stable while `serverId` is assigned after upload.
 */
export type InteractionAttachment = LearningThreadAttachmentSummary & {
  clientId?: string;
  serverId?: string;
  uploadState?: AttachmentUploadState;
  /** A 0..1 value when the transport reports a total, otherwise undefined. */
  uploadProgress?: number;
  localPreviewUrl?: string;
};

export type InteractionAttachmentPatch = Partial<
  Pick<
    InteractionAttachment,
    | "serverId"
    | "fileUrl"
    | "fileName"
    | "mimeType"
    | "fileSize"
    | "kind"
    | "uploadState"
    | "uploadProgress"
  >
>;

export function createClientEntityId(kind: "thread" | "reply" | "note"): string {
  const randomUuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `client-${kind}-${randomUuid}`;
}

export function createLocalComposerAttachment(file: File): LocalComposerAttachment {
  const mediaType = getAttachmentMediaType(file.type, file.name);
  const localPreviewUrl =
    (mediaType === "image" || mediaType === "video") && canCreateObjectUrl()
      ? URL.createObjectURL(file)
      : undefined;

  return {
    id: `client-attachment-${
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }`,
    file,
    fileName: file.name || "attachment",
    mimeType: file.type,
    fileSize: file.size,
    kind: getAttachmentKind(file.type, file.name),
    mediaType,
    localPreviewUrl,
  };
}

export function revokeLocalAttachmentPreview(
  attachment: Pick<LocalComposerAttachment, "localPreviewUrl">,
): void {
  if (attachment.localPreviewUrl && canCreateObjectUrl()) {
    URL.revokeObjectURL(attachment.localPreviewUrl);
  }
}

function canCreateObjectUrl(): boolean {
  return (
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof URL.revokeObjectURL === "function"
  );
}

export function toInteractionAttachment(
  attachment: LocalComposerAttachment,
): InteractionAttachment {
  return {
    id: attachment.id,
    clientId: attachment.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    // The renderer uses localPreviewUrl until the authoritative URL arrives.
    fileUrl: attachment.localPreviewUrl ?? "",
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    uploadState: "uploading",
    uploadProgress: 0,
    localPreviewUrl: attachment.localPreviewUrl,
  };
}

export function mergeConfirmedInteractionAttachment(
  serverAttachment: LearningThreadAttachmentSummary,
  localAttachment?: InteractionAttachment,
): InteractionAttachment {
  const clientId = localAttachment?.clientId ?? localAttachment?.id;
  return {
    ...serverAttachment,
    id: clientId ?? serverAttachment.id,
    ...(clientId ? { clientId } : {}),
    serverId: serverAttachment.id,
    uploadState: "confirmed",
    uploadProgress: 1,
  };
}

export function mergeConfirmedInteractionAttachments(
  serverAttachments: readonly LearningThreadAttachmentSummary[] | undefined,
  localAttachments: readonly InteractionAttachment[] | undefined,
): InteractionAttachment[] {
  return (serverAttachments ?? []).map((serverAttachment) =>
    mergeConfirmedInteractionAttachment(
      serverAttachment,
      localAttachments?.find(
        (attachment) =>
          attachment.serverId === serverAttachment.id ||
          attachment.id === serverAttachment.id,
      ),
    ),
  );
}

function getAttachmentKind(
  mimeType: string,
  fileName: string,
): LearningThreadAttachmentSummary["kind"] {
  if (mimeType.startsWith("image/")) {
    return fileName.toLowerCase().includes("screenshot")
      ? "screenshot"
      : "image";
  }
  if (
    mimeType === "application/json" ||
    /\.(?:ts|tsx|js|jsx|py|rs|go|java|cpp|c|html|css|json|sql|sh)$/i.test(
      fileName,
    )
  ) {
    return "code";
  }
  return "document";
}

function getAttachmentMediaType(
  mimeType: string,
  fileName: string,
): LocalComposerAttachment["mediaType"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return getAttachmentKind(mimeType, fileName) === "code" ? "code" : "document";
}
