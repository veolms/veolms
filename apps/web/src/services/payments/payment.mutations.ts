import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "../courses/courses.keys";
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
