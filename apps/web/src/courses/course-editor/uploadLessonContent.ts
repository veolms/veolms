import {
  LESSON_CONTENT_MEDIA_TYPE,
  type LessonContentKind,
} from "@veolms/contracts";
import { mediaService, uploadVideoResumable } from "../../services/media";
import { lessonContentMimeType } from "../curriculum/lessonContentFiles";

/** The kind a lesson's upload is for: the type being edited. */
export function lessonUploadKind(contentType: string): LessonContentKind {
  return contentType === "audio" ||
    contentType === "image" ||
    contentType === "document"
    ? contentType
    : "video";
}

/**
 * Uploads a lesson's file of one kind to the creator's library and returns
 * its media id, ready to attach: a video in resumable parts (it is then
 * processed), any other file in one request, stored as its kind.
 */
export async function uploadLessonContentFile(
  kind: LessonContentKind,
  file: File,
): Promise<string> {
  if (kind === "video") {
    const result = await uploadVideoResumable({
      file,
      visibility: "protected",
    });
    return result.mediaAssetId;
  }
  const presigned = await mediaService.presignMediaUpload({
    filename: file.name,
    contentType: lessonContentMimeType(kind, file),
    fileSize: file.size,
    type: LESSON_CONTENT_MEDIA_TYPE[kind],
    visibility: "protected",
  });
  await mediaService.uploadFileToPresignedUrl(presigned.uploadUrl, file);
  await mediaService.confirmUpload(presigned.mediaAssetId);
  return presigned.mediaAssetId;
}
