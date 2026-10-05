import { useQuery } from "@tanstack/react-query";
import type { HomeDiscoveryResponse } from "@veolms/contracts";
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
