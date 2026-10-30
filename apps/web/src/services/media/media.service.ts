import type {
  MediaImageVariantManifest,
  MediaSourceResponse,
  MediaUploadCompleteResponse,
  MultipartUploadAbortResponse,
  MultipartUploadPartUrlsResponse,
  MultipartUploadStartRequest,
  MultipartUploadStartResponse,
  MultipartUploadStatusResponse,
  VideoJobProgressResponse,
  PresignMediaRequest,
  PresignMediaResponse,
  VideoTranscodeCancelResponse,
  VideoTranscodeRetryResponse,
  YoutubeImportAvailabilityResponse,
  YoutubeImportControlResponse,
  YoutubeImportLessonQuery,
  YoutubeImportLessonResponse,
  YoutubeImportPreviewRequest,
  YoutubeImportPreviewResponse,
  YoutubeImportRequest,
  YoutubeImportResponse,
} from "@veolms/contracts";
import { api, getApiBaseUrl } from "../../lib/api-client";

export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export type UploadProgressHandler = (progress: UploadProgress) => void;

function requestPresignedMediaUpload(
  payload: PresignMediaRequest,
): Promise<PresignMediaResponse> {
  return api.post<PresignMediaResponse>("/media/presign", payload);
}

export const mediaService = {
  getImageVariantManifest(
    mediaAssetId: string,
  ): Promise<MediaImageVariantManifest> {
    return api.get<MediaImageVariantManifest>(
      `/media/${mediaAssetId}/image-variants`,
    );
  },

  getImageVariantUrl(mediaAssetId: string, width: number): string {
    return `${getApiBaseUrl().replace(/\/$/, "")}/media/${mediaAssetId}/variants/${width}`;
  },

  /**
   * Public CDN URL of the frame the transcoder captures for a video asset.
   * The key mirrors the API's `thumbnailDestination`; the file exists once
   * the transcode job has passed its thumbnail step.
   */
  getVideoThumbnailUrl(mediaAssetId: string): string {
    const cdnBaseUrl = String(import.meta.env.VITE_CDN_URL || "/cdn").replace(
      /\/+$/,
      "",
    );
    return `${cdnBaseUrl}/public/thumbnails/${encodeURIComponent(mediaAssetId)}/original.webp`;
  },

  presignMediaUpload(
    payload: PresignMediaRequest,
  ): Promise<PresignMediaResponse> {
    return requestPresignedMediaUpload(payload);
  },

  startMultipartVideoUpload(
    payload: Omit<MultipartUploadStartRequest, "type" | "visibility"> & {
      visibility?: MultipartUploadStartRequest["visibility"];
    },
  ): Promise<MultipartUploadStartResponse> {
    return api.post<MultipartUploadStartResponse>("/media/multipart/start", {
      ...payload,
      type: "video",
      visibility: payload.visibility ?? "protected",
    });
  },

  getMultipartUploadStatus(
    mediaAssetId: string,
  ): Promise<MultipartUploadStatusResponse> {
    return api.get<MultipartUploadStatusResponse>(
      `/media/${mediaAssetId}/multipart`,
    );
  },

  presignMultipartUploadParts(
    mediaAssetId: string,
    partNumbers: number[],
  ): Promise<MultipartUploadPartUrlsResponse> {
    return api.post<MultipartUploadPartUrlsResponse>(
      `/media/${mediaAssetId}/multipart/parts`,
      { partNumbers },
    );
  },

  completeMultipartUpload(
    mediaAssetId: string,
  ): Promise<MediaUploadCompleteResponse> {
    return api.post<MediaUploadCompleteResponse>(
      `/media/${mediaAssetId}/multipart/complete`,
      {},
    );
  },

  abortMultipartUpload(
    mediaAssetId: string,
  ): Promise<MultipartUploadAbortResponse> {
    return api.post<MultipartUploadAbortResponse>(
      `/media/${mediaAssetId}/multipart/abort`,
    );
  },

  uploadFileToPresignedUrl(
    uploadUrl: string,
    file: File,
    onProgress?: UploadProgressHandler,
    signal?: AbortSignal,
  ): Promise<void> {
    if (typeof XMLHttpRequest === "undefined") {
      return Promise.reject(
        new Error("Media uploads are only available in a browser."),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;

      const cleanup = () => {
        signal?.removeEventListener("abort", abortUpload);
      };

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const abortUpload = () => {
        xhr.abort();
        finish(() => reject(createAbortError()));
      };

      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }

      signal?.addEventListener("abort", abortUpload, { once: true });
      xhr.open("PUT", uploadUrl, true);
      xhr.withCredentials = false;
      xhr.setRequestHeader(
        "Content-Type",
        file.type || "application/octet-stream",
      );

      xhr.upload.addEventListener("progress", (event) => {
        const totalBytes = event.lengthComputable ? event.total : file.size;
        const loadedBytes = Math.min(event.loaded, totalBytes);
        const percent = totalBytes
          ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
          : 0;

        onProgress?.({ loadedBytes, totalBytes, percent });
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.({
            loadedBytes: file.size,
            totalBytes: file.size,
            percent: 100,
          });
          finish(resolve);
          return;
        }

        finish(() =>
          reject(
            new Error(
              `Storage upload failed with status ${xhr.status || "unknown"}.`,
            ),
          ),
        );
      });

      xhr.addEventListener("error", () =>
        finish(() => reject(new Error("The media upload was interrupted."))),
      );
      xhr.addEventListener("timeout", () =>
        finish(() => reject(new Error("The media upload timed out."))),
      );
      xhr.addEventListener("abort", () => {
        if (!settled) finish(() => reject(createAbortError()));
      });

      xhr.send(file);
    });
  },

  confirmUpload(mediaAssetId: string): Promise<MediaUploadCompleteResponse> {
    return api.post<MediaUploadCompleteResponse>(
      `/media/${mediaAssetId}/upload-complete`,
    );
  },

  getMediaSource(mediaAssetId: string): Promise<MediaSourceResponse> {
    return api.get<MediaSourceResponse>(`/media/${mediaAssetId}/source`);
  },

  getVideoJobProgress(mediaAssetId: string): Promise<VideoJobProgressResponse> {
    return api.get<VideoJobProgressResponse>(`/media/${mediaAssetId}/progress`);
  },

  createVideoJobProgressEventSource(mediaAssetId: string): EventSource {
    if (
      typeof window === "undefined" ||
      typeof window.EventSource === "undefined"
    ) {
      throw new Error(
        "Live transcoding updates are not supported in this browser.",
      );
    }

    return new window.EventSource(
      `${getApiBaseUrl().replace(/\/$/, "")}/media/${mediaAssetId}/progress/stream`,
      { withCredentials: true },
    );
  },

  retryTranscode(mediaAssetId: string): Promise<VideoTranscodeRetryResponse> {
    return api.post<VideoTranscodeRetryResponse>(
      `/media/${mediaAssetId}/transcode/retry`,
    );
  },

  cancelTranscode(mediaAssetId: string): Promise<VideoTranscodeCancelResponse> {
    return api.post<VideoTranscodeCancelResponse>(
      `/media/${mediaAssetId}/transcode/cancel`,
    );
  },

  getYoutubeImportAvailability(): Promise<YoutubeImportAvailabilityResponse> {
    return api.get<YoutubeImportAvailabilityResponse>(
      "/media/youtube-import/availability",
    );
  },

  previewYoutubeImport(
    payload: YoutubeImportPreviewRequest,
  ): Promise<YoutubeImportPreviewResponse> {
    return api.post<YoutubeImportPreviewResponse>(
      "/media/youtube-import/preview",
      payload,
    );
  },

  /** Queues the import; follow it with the usual video progress stream. */
  startYoutubeImport(
    payload: YoutubeImportRequest,
  ): Promise<YoutubeImportResponse> {
    return api.post<YoutubeImportResponse>("/media/youtube-import", payload);
  },

  /** The lesson's running or retryable import, for the editor to show again. */
  getLessonYoutubeImport(
    query: YoutubeImportLessonQuery,
  ): Promise<YoutubeImportLessonResponse> {
    return api.get<YoutubeImportLessonResponse>(
      "/media/youtube-import/lesson",
      {
        params: query,
      },
    );
  },

  retryYoutubeImport(
    mediaAssetId: string,
  ): Promise<YoutubeImportControlResponse> {
    return api.post<YoutubeImportControlResponse>(
      `/media/${mediaAssetId}/youtube-import/retry`,
    );
  },

  cancelYoutubeImport(
    mediaAssetId: string,
  ): Promise<YoutubeImportControlResponse> {
    return api.post<YoutubeImportControlResponse>(
      `/media/${mediaAssetId}/youtube-import/cancel`,
    );
  },
};

function createAbortError(): Error {
  const error = new Error("The video upload was cancelled.");
  error.name = "AbortError";
  return error;
}
