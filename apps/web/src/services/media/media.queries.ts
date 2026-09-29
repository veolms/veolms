import { useQuery } from "@tanstack/react-query";
import { mediaKeys } from "./media.keys";
import { mediaService } from "./media.service";

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
