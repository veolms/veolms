import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AffiliateMeResponse } from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { affiliatesKeys } from "./affiliates.keys";
import { affiliatesService } from "./affiliates.service";

/** Records a visit through an affiliate's link. Fire and forget. */
export function useRecordAffiliateClick() {
  return useMutation({
    mutationFn: affiliatesService.recordClick,
    retry: false,
  });
}

/** Ties the browser's affiliate click to the account that signed in. */
export function useClaimAffiliateReferral() {
  return useMutation({
    mutationFn: affiliatesService.claimReferral,
    retry: false,
  });
}

/** Every change answers with the whole record: it replaces the cached one. */
function useMeMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<AffiliateMeResponse>,
) {
  const queryClient = useQueryClient();
  return useMutation<AffiliateMeResponse, ApiError, TVariables>({
    mutationFn,
    onSuccess: (me) => queryClient.setQueryData(affiliatesKeys.me(), me),
  });
}

export function useApplyAffiliate() {
  return useMeMutation(affiliatesService.apply);
}

export function useUpdateAffiliateMe() {
  return useMeMutation(affiliatesService.updateMe);
}

export function useSetAffiliatePayoutDetails() {
  return useMeMutation(affiliatesService.setPayoutDetails);
}

export function useDeleteAffiliatePayoutDetails() {
  return useMeMutation(() => affiliatesService.deletePayoutDetails());
}

export function useRequestAffiliatePayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: affiliatesService.requestPayout,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: affiliatesKeys.me() }),
        queryClient.invalidateQueries({ queryKey: affiliatesKeys.payouts() }),
        queryClient.invalidateQueries({
          queryKey: [...affiliatesKeys.all, "commissions"],
        }),
      ]);
    },
  });
}
