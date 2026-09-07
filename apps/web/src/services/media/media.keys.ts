export const mediaKeys = {
  all: ["media"] as const,
  videoProgress: (mediaAssetId: string) =>
    [...mediaKeys.all, "video-progress", mediaAssetId] as const,
};
