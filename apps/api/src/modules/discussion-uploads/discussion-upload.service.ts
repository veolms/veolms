import type { MultipartFile } from "@fastify/multipart";
import {
  getLocalDiscussionUpload,
  removeLocalDiscussionUpload,
  storeLocalDiscussionUpload,
} from "./discussion-upload.storage.ts";

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_VIDEO_BYTES = 50_000_000;

export async function saveDiscussionUpload(file: MultipartFile) {
  const mediaType = file.mimetype.startsWith("image/")
    ? ("image" as const)
    : file.mimetype.startsWith("video/")
      ? ("video" as const)
      : null;
  if (!mediaType) throw new Error("UNSUPPORTED_DISCUSSION_UPLOAD_TYPE");

  const stored = await storeLocalDiscussionUpload({
    mimeType: file.mimetype,
    stream: file.file,
  });
  const limit = mediaType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (stored.size > limit || file.file.truncated) {
    await removeLocalDiscussionUpload(stored.fileName);
    throw new Error("DISCUSSION_UPLOAD_TOO_LARGE");
  }

  return {
    ...stored,
    mediaType,
    url: `/api/v1/dev/discussion-uploads/${stored.fileName}`,
  };
}

export { getLocalDiscussionUpload };
