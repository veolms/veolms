export const mediaKeys = {
  all: ["media"] as const,
  videoProgress: (mediaAssetId: string) =>
    [...mediaKeys.all, "video-progress", mediaAssetId] as const,
  imageVariantManifest: (mediaAssetId: string) =>
    [...mediaKeys.all, "image-variant-manifest", mediaAssetId] as const,
  youtubeImportAvailability: () =>
    [...mediaKeys.all, "youtube-import-availability"] as const,
  attachedVideoStatus: (mediaAssetId: string) =>
    [...mediaKeys.all, "attached-video-status", mediaAssetId] as const,
  lessonYoutubeImport: (lessonId: string) =>
    [...mediaKeys.all, "lesson-youtube-import", lessonId] as const,
};
