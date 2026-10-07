import { useQuery } from "@tanstack/react-query";
import type { CapabilitiesResponse, Permission } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { useAuthStore } from "../../store/auth.store";
import { authorizationKeys } from "./authorization.keys";
import { authorizationService } from "./authorization.service";

export function useCapabilities(options?: {
  courseId?: string;
  enabled?: boolean;
}) {
  const userId = useAuthStore((state) => state.user?.id);
  const query = useQuery<CapabilitiesResponse, ApiError>({
    queryKey: authorizationKeys.capabilities({
      courseId: options?.courseId,
      userId,
    }),
    queryFn: () =>
      authorizationService.getCapabilities({
        courseId: options?.courseId,
      }),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });

  const permissions = new Set(query.data?.permissions ?? []);

  const can = (permission: Permission): boolean => {
    return permissions.has(permission);
  };

  return {
    ...query,
    can,
    permissions: query.data?.permissions ?? [],
  };
}
