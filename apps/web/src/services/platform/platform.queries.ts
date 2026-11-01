import { useQuery } from "@tanstack/react-query";
import type {
  PlatformSettingsResponse,
  PublicPlatformSettingsResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { platformKeys } from "./platform.keys";
import { platformService } from "./platform.service";

/** The Platform page's settings (administrators only). */
export function usePlatformSettings() {
  return useQuery<PlatformSettingsResponse, ApiError>({
    queryKey: platformKeys.settings(),
    queryFn: () => platformService.getSettings(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * The academy's defaults and student rules, read once per visit by every
 * browser. They change rarely, and a visitor sees a change on their next
 * visit at the latest.
 */
export function usePublicPlatformSettings({ enabled = true } = {}) {
  return useQuery<PublicPlatformSettingsResponse, ApiError>({
    queryKey: platformKeys.publicSettings(),
    queryFn: () => platformService.getPublicSettings(),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled,
  });
}
