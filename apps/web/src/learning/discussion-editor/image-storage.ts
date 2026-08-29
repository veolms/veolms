import { discussionService } from "../../services/discussion";

export interface StoredDiscussionAttachment {
  url: string;
  fileName: string;
  mediaType: "image" | "video";
  mimeType: string;
  size: number;
}

export interface DiscussionAttachmentStorage {
  upload(file: File): Promise<StoredDiscussionAttachment>;
}

export const DISCUSSION_ATTACHMENTS_ENABLED = import.meta.env.DEV;

export const localDiscussionAttachmentStorage: DiscussionAttachmentStorage = {
  upload: (file) => discussionService.uploadAttachment(file),
};

// TODO(storage): swap this adapter for an authenticated S3-compatible upload
// service when discussion entries are persisted by the backend.
