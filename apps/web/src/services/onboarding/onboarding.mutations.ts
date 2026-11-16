import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FirstMovesResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { onboardingKeys } from "./onboarding.keys";
import { onboardingService } from "./onboarding.service";

/** Remembers that the academy's link was shared, which ticks that move. */
export function useMarkLinkShared() {
  const queryClient = useQueryClient();
  return useMutation<FirstMovesResponse, ApiError, void>({
    mutationFn: () => onboardingService.markLinkShared(),
    onSuccess: (moves) => {
      queryClient.setQueryData(onboardingKeys.firstMoves(), moves);
    },
  });
}
