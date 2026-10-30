import { useQuery } from "@tanstack/react-query";
import { mediaKeys } from "./media.keys";
import { mediaService } from "./media.service";

/** How often a video's processing is checked while it is still going on. */
const VIDEO_PROGRESS_POLL_MS = 3000;

/**
 * A video's processing (transcoding), checked every few seconds until it
 * has finished one way or the other.
 */
export function useVideoJobProgress(mediaAssetId: string | null) {
  return useQuery({
    queryKey: mediaKeys.videoProgress(mediaAssetId ?? ""),
    queryFn: () => mediaService.getVideoJobProgress(mediaAssetId!),
    enabled: Boolean(mediaAssetId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" ||
        status === "failed" ||
        status === "cancelled"
        ? false
        : VIDEO_PROGRESS_POLL_MS;
    },
  });
}

/**
 * Where a video came from (the YouTube video it was imported from), for
 * the people who manage it. Its link never changes; its title and channel
 * are filled in once the import has read the video.
 */
export function useMediaSource(mediaAssetId: string | null) {
  return useQuery({
    queryKey: mediaKeys.source(mediaAssetId ?? ""),
    queryFn: () => mediaService.getMediaSource(mediaAssetId!),
    enabled: Boolean(mediaAssetId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Whether this account may import lesson videos from YouTube: the academy
 * turned it on and the account holds the permission. Any error (403 for
 * everyone without the permission) reads as "not available".
 */
export function useYoutubeImportAvailability(enabled: boolean) {
  const query = useQuery({
    queryKey: mediaKeys.youtubeImportAvailability(),
    queryFn: () => mediaService.getYoutubeImportAvailability(),
    enabled,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  return query.data?.enabled === true;
}

/**
 * Where a lesson's attached video stands, read once when an editor opens:
 * a video still being processed (an upload or import the editor was closed
 * on) is then followed live instead of showing an empty player. A video
 * with no processing record (404) reads as no status.
 */
export function useAttachedVideoStatus(
  mediaAssetId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: mediaKeys.attachedVideoStatus(mediaAssetId ?? ""),
    queryFn: () => mediaService.getVideoJobProgress(mediaAssetId!),
    enabled: Boolean(mediaAssetId) && enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * The lesson's YouTube import that is still running (or failed and can be
 * retried), so an editor opened later can show it again. Read once per
 * opening; the progress stream follows it from there.
 */
export function useLessonYoutubeImport(
  target: { courseId: string; lessonId: string } | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: mediaKeys.lessonYoutubeImport(target?.lessonId ?? ""),
    queryFn: () => mediaService.getLessonYoutubeImport(target!),
    enabled: Boolean(target) && enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useMediaImageVariantManifest(
  mediaAssetId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: mediaKeys.imageVariantManifest(mediaAssetId ?? ""),
    queryFn: () => mediaService.getImageVariantManifest(mediaAssetId!),
    enabled: Boolean(mediaAssetId) && enabled,
    staleTime: 5 * 60 * 1000,
  });
}
