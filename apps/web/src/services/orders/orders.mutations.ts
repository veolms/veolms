import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  OrderDirectRefundRequest,
  Refund,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { orderKeys } from "./orders.keys";
import { ordersService } from "./orders.service";

export function useRefundOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    Refund,
    ApiError,
    { orderId: string; payload: OrderDirectRefundRequest }
  >({
    mutationFn: ({ orderId, payload }) =>
      ordersService.refundOrder(orderId, payload),
    onSuccess: (_data, variables) => {
      // Invalidate order lists, stats, and the specific order detail
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({
        queryKey: orderKeys.detail(variables.orderId),
      });
    },
  });
}
