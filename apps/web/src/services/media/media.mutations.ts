import { useMutation } from "@tanstack/react-query";
import type {
  PresignMediaRequest,
  YoutubeImportPreviewResponse,
  YoutubeImportRequest,
  YoutubeImportResponse,
} from "@veolms/contracts";
import { uploadVideoResumable } from "./resumable-upload";
import { mediaService, type UploadProgressHandler } from "./media.service";

export interface VideoUploadInput {
  file: File;
  visibility?: PresignMediaRequest["visibility"];
  onProgress?: UploadProgressHandler;
  signal?: AbortSignal;
}

/**
 * Uploads a video in resumable parts and confirms it, which queues its
 * processing (transcoding). Resolves with the new media asset's id; its
 * processing can then be followed with `useVideoJobProgress`.
 *
 * An interrupted upload leaves a local checkpoint behind, so choosing the
 * same file again continues from the parts storage already accepted.
 */
export function useUploadVideo() {
  return useMutation<string, Error, VideoUploadInput>({
    mutationFn: async ({ file, visibility, onProgress, signal }) => {
      const result = await uploadVideoResumable({
        file,
        visibility,
        onProgress,
        signal,
      });
      return result.mediaAssetId;
    },
  });
}

/** Reads a YouTube video's title, length and qualities (nothing is downloaded). */
export function usePreviewYoutubeImport() {
  return useMutation<YoutubeImportPreviewResponse, Error, string>({
    mutationFn: (url) => mediaService.previewYoutubeImport({ url }),
  });
}

/**
 * Queues a YouTube import into a lesson. Resolves with the new media
 * asset's id; its progress is followed like an upload's transcoding.
 */
export function useStartYoutubeImport() {
  return useMutation<YoutubeImportResponse, Error, YoutubeImportRequest>({
    mutationFn: (payload) => mediaService.startYoutubeImport(payload),
  });
}
