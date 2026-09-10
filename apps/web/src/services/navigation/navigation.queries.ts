import { useQuery } from "@tanstack/react-query";
import type { SidenavResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { navigationKeys } from "./navigation.keys";
import { navigationService } from "./navigation.service";

export function useSidenav(options?: { enabled?: boolean }) {
  return useQuery<SidenavResponse, ApiError>({
    queryKey: navigationKeys.sidenav(),
    queryFn: () => navigationService.getSidenav(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
