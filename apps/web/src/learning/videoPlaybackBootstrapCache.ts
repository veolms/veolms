import type { VideoPlaybackBootstrap } from "@veolms/contracts";

interface VideoPlaybackBootstrapCacheKey {
  courseSlug: string;
  lessonNumber: number;
}

const bootstrapCache = new Map<string, VideoPlaybackBootstrap>();

const cacheKey = ({
  courseSlug,
  lessonNumber,
}: VideoPlaybackBootstrapCacheKey) => `${courseSlug}\u0000${lessonNumber}`;

export function getCachedVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapCacheKey,
): VideoPlaybackBootstrap | null {
  return bootstrapCache.get(cacheKey(options)) ?? null;
}

export function setCachedVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapCacheKey,
  bootstrap: VideoPlaybackBootstrap,
): void {
  bootstrapCache.set(cacheKey(options), bootstrap);
}

export function deleteCachedVideoPlaybackBootstrap(
  options: VideoPlaybackBootstrapCacheKey,
): void {
  bootstrapCache.delete(cacheKey(options));
}

export function clearCachedVideoPlaybackBootstraps(): void {
  bootstrapCache.clear();
}
