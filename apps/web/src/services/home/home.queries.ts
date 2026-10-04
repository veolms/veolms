import type { HomeDiscoveryResponse } from "@veolms/contracts";

import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "../../lib/api-error";

import { homeKeys } from "./home.keys";
import { homeService } from "./home.service";

export function useHomeDiscovery(options?: { enabled?: boolean }) {
  return useQuery<HomeDiscoveryResponse, ApiError>({
    queryKey: homeKeys.discovery(),
    queryFn: () => homeService.getDiscovery(),
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 60 * 1000,
  });
}
