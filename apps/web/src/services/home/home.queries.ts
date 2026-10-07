import { useQuery, type QueryClient } from "@tanstack/react-query";
import type {
  GuestHomePageResponse,
  HomeDiscoveryResponse,
  HomePageOptionsResponse,
  HomePageSettingsResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { homeKeys } from "./home.keys";
import { homeService } from "./home.service";

export function useHomeDiscovery(options?: {
  enabled?: boolean;
  initialData?: HomeDiscoveryResponse;
}) {
  return useQuery<HomeDiscoveryResponse, ApiError>({
    queryKey: homeKeys.discovery(),
    queryFn: () => homeService.getDiscovery(),
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    retry: false,
    staleTime: options?.initialData ? Infinity : 60 * 1000,
  });
}

/**
 * The signed-out home page. `initialData` is the copy the production build
 * prerendered; it is treated as stale so the page is checked against the
 * current settings once `enabled`, and only changes on screen when an admin
 * has changed something since that build.
 */
export function useGuestHomePage(options?: {
  enabled?: boolean;
  initialData?: GuestHomePageResponse;
}) {
  return useQuery<GuestHomePageResponse, ApiError>({
    queryKey: homeKeys.guestPage(),
    queryFn: () => homeService.getGuestPage(),
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialData ? 0 : undefined,
    retry: false,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Loads the signed-out home page ahead of a visit to it, so that opening it
 * from another page finds its courses and discussions already there.
 */
export function prefetchGuestHomePage(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: homeKeys.guestPage(),
    queryFn: () => homeService.getGuestPage(),
    staleTime: 60 * 1000,
  });
}

export function useHomePageSettings() {
  return useQuery<HomePageSettingsResponse, ApiError>({
    queryKey: homeKeys.pageSettings(),
    queryFn: () => homeService.getPageSettings(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHomePageSettingsOptions() {
  return useQuery<HomePageOptionsResponse, ApiError>({
    queryKey: homeKeys.pageSettingsOptions(),
    queryFn: () => homeService.getPageSettingsOptions(),
    staleTime: 60 * 1000,
  });
}
