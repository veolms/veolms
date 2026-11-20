import { useMutation } from "@tanstack/react-query";

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
