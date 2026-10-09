import type { UploadedAttachment } from "@veolms/contracts";
import {
  type InteractionAttachmentPatch,
  type LocalComposerAttachment,
} from "./attachment-model";
import {
  learningInteractionsService,
  type DiscussionAttachmentUploadContext,
} from "./learning-interactions.service";

export async function uploadInteractionAttachments(
  attachments: readonly LocalComposerAttachment[],
  onAttachmentChange: (
    attachmentId: string,
    patch: InteractionAttachmentPatch,
  ) => void,
  context?: DiscussionAttachmentUploadContext,
): Promise<UploadedAttachment[]> {
  if (attachments.length > 0 && !context) {
    throw new Error("Course and lesson context are required for attachments.");
  }

  return Promise.all(
    attachments.map(async (attachment) => {
      onAttachmentChange(attachment.id, {
        uploadState: "uploading",
        uploadProgress: 0,
      });
      const uploaded = await learningInteractionsService.uploadAttachmentDirect(
        attachment.file,
        ({ loaded, total }) => {
          onAttachmentChange(attachment.id, {
            uploadState: "uploading",
            ...(total && total > 0
              ? { uploadProgress: Math.max(0, Math.min(1, loaded / total)) }
              : {}),
          });
        },
        { width: attachment.width, height: attachment.height },
        context,
      );
      onAttachmentChange(attachment.id, {
        serverId: uploaded.id,
        fileUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        kind: uploaded.kind,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        uploadState: "confirmed",
        uploadProgress: 1,
      });
      return uploaded;
    }),
  );
}

// TODO(backend): uploads are intentionally deferred until Post, but an upload
// can still succeed before its interaction create fails. Add orphan TTL or
// explicit discard semantics server-side for those unattached records.
