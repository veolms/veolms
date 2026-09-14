import { learningInteractionsService } from "../../services/learning-interactions/learning-interactions.service";

export interface StoredDiscussionAttachment {
  id?: string;
  url: string;
  fileName: string;
  mediaType?: "image" | "video" | "code" | "document";
  mimeType: string;
  size: number;
  kind?: "image" | "screenshot" | "code" | "document";
}

export interface DiscussionAttachmentStorage {
  upload(file: File): Promise<StoredDiscussionAttachment>;
}

export const DISCUSSION_ATTACHMENTS_ENABLED = true;

export const localDiscussionAttachmentStorage: DiscussionAttachmentStorage = {
  upload: async (file) => {
    const res = await learningInteractionsService.uploadAttachmentDirect(file);
    return {
      id: res.id,
      url: res.url,
      fileName: res.fileName,
      mediaType: res.mediaType,
      mimeType: res.mimeType,
      size: res.size,
      kind: res.kind,
    };
  },
};
