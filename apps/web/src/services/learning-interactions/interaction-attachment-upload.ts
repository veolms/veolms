import type { LearningUploadResponse } from "@veolms/contracts";
import {
  type InteractionAttachmentPatch,
  type LocalComposerAttachment,
} from "./attachment-model";
import { learningInteractionsService } from "./learning-interactions.service";

export async function uploadInteractionAttachments(
  attachments: readonly LocalComposerAttachment[],
  onAttachmentChange: (
    attachmentId: string,
    patch: InteractionAttachmentPatch,
  ) => void,
): Promise<LearningUploadResponse[]> {
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
      );
      onAttachmentChange(attachment.id, {
        serverId: uploaded.id,
        fileUrl: uploaded.url,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.size,
        kind: uploaded.kind,
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
