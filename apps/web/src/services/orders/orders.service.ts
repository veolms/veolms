import { api, getApiBaseUrl } from "../../lib/api-client";
import type {
  AdminOrdersListResponse,
  LearnerOrdersListResponse,
  OrderResponse,
  OrdersListQueryInput,
  OrderStatsQuery,
  OrderStatsResponse,
  Invoice,
  OrderDirectRefundRequest,
  RefundResult,
  OrderView,
  NeedsRefundListQueryInput,
  NeedsRefundListResponse,
  RefundRequest,
  ReviewRefundRequest,
} from "@veolms/contracts";

/** `view` decides the response shape, so each list function fixes its own. */
export type OrdersListParams = Omit<OrdersListQueryInput, "view">;

export const ordersService = {
  /** Every order in the academy, with buyer and payment details. */
  listAdminOrders: (
    params?: OrdersListParams,
  ): Promise<AdminOrdersListResponse> => {
    return api.get<AdminOrdersListResponse>("/orders", {
      params: { ...params, view: "admin" },
    });
  },

  /** The signed-in user's own purchases. */
  listMyOrders: (
    params?: OrdersListParams,
  ): Promise<LearnerOrdersListResponse> => {
    return api.get<LearnerOrdersListResponse>("/orders", {
      params: { ...params, view: "student" },
    });
  },

  getOrderStats: (params?: OrderStatsQuery): Promise<OrderStatsResponse> => {
    return api.get<OrderStatsResponse>("/orders/stats", { params });
  },

  /**
   * Money staff have to return by hand: surplus gateway payments and
   * duplicate purchases, newest first. Needs the same permission as the
   * admin orders list.
   */
  listNeedsRefund: (
    params?: NeedsRefundListQueryInput,
  ): Promise<NeedsRefundListResponse> => {
    return api.get<NeedsRefundListResponse>("/orders/needs-refund", {
      params,
    });
  },

  getOrder: (orderId: string, view?: OrderView): Promise<OrderResponse> => {
    return api.get<OrderResponse>(`/orders/${orderId}`, {
      params: view ? { view } : undefined,
    });
  },

  getInvoice: (orderId: string, view?: OrderView): Promise<Invoice> => {
    return api.get<Invoice>(`/orders/${orderId}/invoice`, {
      params: view ? { view } : undefined,
    });
  },

  getInvoiceDownloadUrl: (orderId: string, view?: OrderView): string => {
    const base = getApiBaseUrl();
    const queryString = view ? `?view=${encodeURIComponent(view)}` : "";
    return `${base}/orders/${orderId}/invoice/download${queryString}`;
  },

  refundOrder: (
    orderId: string,
    payload: OrderDirectRefundRequest,
  ): Promise<RefundResult> => {
    return api.post<RefundResult>(`/orders/${orderId}/refund`, payload);
  },

  /**
   * Approves or rejects a learner's refund request (admins only). Approving
   * issues the refund; for an order paid by manual transfer the payload
   * carries `outsideRefund`, and the refund is recorded in the same step.
   */
  reviewRefundRequest: (
    requestId: string,
    payload: ReviewRefundRequest,
  ): Promise<RefundRequest> => {
    return api.post<RefundRequest>(
      `/refund-requests/${encodeURIComponent(requestId)}/review`,
      payload,
    );
  },
};
