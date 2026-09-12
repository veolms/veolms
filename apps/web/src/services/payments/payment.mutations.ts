import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "../courses/courses.keys";
import { paymentService } from "./payment.service";

export const useCheckoutPreview = () => useMutation({ mutationFn: paymentService.preview });
export const useCreateCheckoutOrder = () => useMutation({ mutationFn: paymentService.createOrder });
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof paymentService.verify>>, ApiError, Parameters<typeof paymentService.verify>[0]>({
    mutationFn: paymentService.verify,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: courseKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["enrollments"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
      ]);
    },
  });
}
