import { useQuery } from "@tanstack/react-query";
import type { FirstMovesResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { onboardingKeys } from "./onboarding.keys";
import { onboardingService } from "./onboarding.service";

/** The admin home's first five moves, for staff who read settings. */
export function useFirstMoves(enabled: boolean) {
  return useQuery<FirstMovesResponse, ApiError>({
    queryKey: onboardingKeys.firstMoves(),
    queryFn: onboardingService.getFirstMoves,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
