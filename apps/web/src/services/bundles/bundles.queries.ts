import { useQuery } from "@tanstack/react-query";
import type {
  CourseBundle,
  CourseBundleOffersResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { bundleKeys } from "./bundles.keys";
import { bundlesService } from "./bundles.service";

/** A course's bundle offers; keyed by viewer, as the price is theirs. */
export function useCourseBundleOffers(
  courseId: string,
  viewerId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<CourseBundleOffersResponse, ApiError>({
    queryKey: bundleKeys.offers(courseId, viewerId),
    queryFn: () => bundlesService.offersForCourse(courseId),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useManagedBundles(options?: { enabled?: boolean }) {
  return useQuery<CourseBundle[], ApiError>({
    queryKey: bundleKeys.manage(),
    queryFn: () => bundlesService.listAll(),
    enabled: options?.enabled ?? true,
  });
}
