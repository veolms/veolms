import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LearnerRefundRequest,
  OrderDirectRefundRequest,
  RefundRequest,
  RefundResult,
  ReviewRefundRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "../courses/courses.keys";
import { enrollmentKeys } from "../enrollments/enrollments.keys";
import { studentKeys } from "../students/students.keys";
import { orderKeys } from "./orders.keys";
import { ordersService } from "./orders.service";

export function useRefundOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    RefundResult,
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
      // A refund can be issued from a student's page, whose course cards
      // show whether the order is still refundable and access still held.
      void queryClient.invalidateQueries({ queryKey: studentKeys.details() });
    },
  });
}

/**
 * A learner asks for their purchase back from Purchase History. An eligible
 * purchase is refunded at once and its course taken away, so the orders,
 * the learner's courses and their enrollments are read again.
 */
export function useRequestRefund() {
  const queryClient = useQueryClient();

  return useMutation<
    LearnerRefundRequest,
    ApiError,
    { orderId: string; reason?: string }
  >({
    mutationFn: ({ orderId, reason }) =>
      ordersService.requestRefund(orderId, reason ? { reason } : {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: courseKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
    },
  });
}

/**
 * Staff answer a learner's refund request. An approval refunds the order,
 * so everything read about orders is read again.
 */
export function useReviewRefundRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    RefundRequest,
    ApiError,
    { requestId: string; payload: ReviewRefundRequest }
  >({
    mutationFn: ({ requestId, payload }) =>
      ordersService.reviewRefundRequest(requestId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
