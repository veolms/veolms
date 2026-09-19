import { useQuery } from "@tanstack/react-query";
import type { CapabilitiesResponse, Permission, FeatureKey } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authorizationKeys } from "./authorization.keys";
import { authorizationService } from "./authorization.service";

export function useCapabilities(options?: {
  courseId?: string;
  enabled?: boolean;
}) {
  const query = useQuery<CapabilitiesResponse, ApiError>({
    queryKey: authorizationKeys.capabilities({
      courseId: options?.courseId,
    }),
    queryFn: () =>
      authorizationService.getCapabilities({
        courseId: options?.courseId,
      }),
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });

  const permissions = new Set(query.data?.permissions ?? []);
  const features = query.data?.features ?? {};

  const can = (permission: Permission): boolean => {
    return permissions.has(permission);
  };

  const hasFeature = (feature: FeatureKey | string): boolean => {
    return Boolean(features[feature]);
  };

  return {
    ...query,
    can,
    hasFeature,
    permissions: query.data?.permissions ?? [],
    features,
  };
}
