import type {
  MediaAssetStatus,
  PresignMediaRequest,
  PresignMediaResponse,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export type UploadProgressHandler = (progress: UploadProgress) => void;

const MEDIA_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

function requestPresignedMediaUpload(
  payload: PresignMediaRequest,
): Promise<PresignMediaResponse> {
  return api.post<PresignMediaResponse>("/media/presign", payload);
}

export const mediaService = {
  presignMediaUpload(
    payload: PresignMediaRequest,
  ): Promise<PresignMediaResponse> {
    return requestPresignedMediaUpload(payload);
  },

  presignVideoUpload(
    payload: Omit<PresignMediaRequest, "type">,
  ): Promise<PresignMediaResponse> {
    return requestPresignedMediaUpload({
      ...payload,
      type: "video",
    });
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

  confirmUpload(mediaAssetId: string): Promise<{ status: MediaAssetStatus }> {
    return api.post<{ status: MediaAssetStatus }>(
      `/media/${mediaAssetId}/upload-complete`,
    );
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
      `${MEDIA_API_BASE_URL.replace(/\/$/, "")}/media/${mediaAssetId}/progress/stream`,
      { withCredentials: true },
    );
  },

  retryTranscode(
    mediaAssetId: string,
  ): Promise<{ should202: boolean; jobId: string }> {
    return api.post(`/media/${mediaAssetId}/transcode/retry`);
  },

  cancelTranscode(mediaAssetId: string): Promise<{ cancelled: true; jobId: string }> {
    return api.post(`/media/${mediaAssetId}/transcode/cancel`);
  },
};

function createAbortError(): Error {
  const error = new Error("The video upload was cancelled.");
  error.name = "AbortError";
  return error;
}
