import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "../../lib/api-error";
import { affiliatesAdminKeys } from "./affiliates.keys";
import { affiliatesAdminService } from "./affiliates-admin.service";

/**
 * Every admin change can move numbers on several tabs (a payout moves the
 * balances, an approval the list), so each refreshes the whole admin side.
 */
function useAdminMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: affiliatesAdminKeys.all,
      });
    },
  });
}

export const useUpdateAffiliateSettings = () =>
  useAdminMutation(affiliatesAdminService.updateSettings);
export const useSetAffiliateRule = () =>
  useAdminMutation(affiliatesAdminService.setRule);
export const useDeleteAffiliateRule = () =>
  useAdminMutation(affiliatesAdminService.deleteRule);
export const useInviteAffiliate = () =>
  useAdminMutation(affiliatesAdminService.invite);
export const useChangeAffiliateStatus = () =>
  useAdminMutation(affiliatesAdminService.changeStatus);
export const useApproveAffiliateCommission = () =>
  useAdminMutation(affiliatesAdminService.approveCommission);
export const useRejectAffiliateCommission = () =>
  useAdminMutation(affiliatesAdminService.rejectCommission);
export const useAddAffiliateAdjustment = () =>
  useAdminMutation(affiliatesAdminService.addAdjustment);
export const useSetOrderAttribution = () =>
  useAdminMutation(affiliatesAdminService.setOrderAttribution);
export const useCreateAffiliatePayouts = () =>
  useAdminMutation(affiliatesAdminService.createPayouts);
export const useMarkAffiliatePayoutPaid = () =>
  useAdminMutation(affiliatesAdminService.markPaid);
export const useCloseAffiliatePayout = () =>
  useAdminMutation(affiliatesAdminService.closePayout);

/** Not cached: full details are fetched on request, and each read is audited. */
export function useRevealPayoutDetails() {
  return useMutation({ mutationFn: affiliatesAdminService.getPayoutDetails });
}
