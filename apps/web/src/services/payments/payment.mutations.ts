import { useCallback } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "../courses/courses.keys";
import { ordersService } from "../orders/orders.service";
import { quizKeys } from "../quizzes/quizzes.keys";
import { paymentService } from "./payment.service";

export const useCheckoutPreview = () =>
  useMutation({ mutationFn: paymentService.preview });
/** Everything that depends on what the learner owns. */
function invalidateAfterPurchase(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: courseKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["enrollments"] }),
    queryClient.invalidateQueries({ queryKey: ["orders"] }),
    queryClient.invalidateQueries({ queryKey: quizKeys.all }),
  ]);
}

export function useCreateCheckoutOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: paymentService.createOrder,
    // With nothing to pay (a free course, a 100% coupon) there is no
    // payment step: the order is complete and access is already granted.
    // Nothing refreshed after it, so the app went on saying "Enroll".
    onSuccess: async (order) => {
      if (!order.gateway) await invalidateAfterPurchase(queryClient);
    },
  });
}
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof paymentService.verify>>,
    ApiError,
    Parameters<typeof paymentService.verify>[0]
  >({
    mutationFn: paymentService.verify,
    onSuccess: async () => {
      await invalidateAfterPurchase(queryClient);
    },
  });
}

const PAID_ORDER_POLL_INTERVAL_MS = 5_000;
// Six minutes: long enough to outlast the server's five-minute recovery cycle.
const PAID_ORDER_POLL_ATTEMPTS = 72;

/**
 * Waits for an order the gateway has already charged to be marked paid.
 *
 * The verify call is one of three ways an order is fulfilled; the gateway
 * webhook and the recovery scheduler are the others. When verify fails after
 * the learner has paid, the order still becomes paid shortly afterwards, so
 * the page watches for that instead of asking the learner to pay again.
 * Resolves true once the order is paid, false if it is not within the window
 * or the wait is aborted.
 */
export function useAwaitPaidOrder() {
  const queryClient = useQueryClient();
  return useCallback(
    async (orderId: string, signal?: AbortSignal): Promise<boolean> => {
      for (let attempt = 0; attempt < PAID_ORDER_POLL_ATTEMPTS; attempt += 1) {
        if (signal?.aborted) return false;
        try {
          const order = await ordersService.getOrder(orderId);
          if (order.status === "paid") {
            await invalidateAfterPurchase(queryClient);
            return true;
          }
        } catch {
          // A dropped connection is the usual reason for being here; keep
          // waiting rather than report a failure the learner cannot act on.
        }
        if (signal?.aborted) return false;
        await new Promise((resolve) =>
          window.setTimeout(resolve, PAID_ORDER_POLL_INTERVAL_MS),
        );
      }
      return false;
    },
    [queryClient],
  );
}
