import type { MultipartFile } from "@fastify/multipart";
import {
  discussionUploadPublicUrl,
  type DiscussionUploadStore,
} from "./discussion-upload.storage.ts";

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_VIDEO_BYTES = 50_000_000;

export function createDiscussionUploadService(store: DiscussionUploadStore) {
  return {
    async save(file: MultipartFile) {
      const mediaType = file.mimetype.startsWith("image/")
        ? ("image" as const)
        : file.mimetype.startsWith("video/")
          ? ("video" as const)
          : null;
      if (!mediaType) throw new Error("UNSUPPORTED_DISCUSSION_UPLOAD_TYPE");

      const stored = await store.putFromStream({
        mimeType: file.mimetype,
        stream: file.file,
      });
      const limit = mediaType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      if (stored.size > limit || file.file.truncated) {
        await store.remove(stored.fileName);
        throw new Error("DISCUSSION_UPLOAD_TOO_LARGE");
      }

      return {
        ...stored,
        mediaType,
        url: discussionUploadPublicUrl(stored.fileName),
      };
    },

    get: store.get.bind(store),
  };
}

export type DiscussionUploadService = ReturnType<
  typeof createDiscussionUploadService
>;
