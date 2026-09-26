import { api, getApiBaseUrl } from "../../lib/api-client";
import type {
  Order,
  OrdersListResponse,
  OrdersListQueryInput,
  OrderStatsQuery,
  OrderStatsResponse,
  Invoice,
  OrderDirectRefundRequest,
  Refund,
  OrderView,
} from "@veolms/contracts";

export const ordersService = {
  listOrders: (params?: OrdersListQueryInput): Promise<OrdersListResponse> => {
    return api.get<OrdersListResponse>("/orders", { params });
  },

  getOrderStats: (params?: OrderStatsQuery): Promise<OrderStatsResponse> => {
    return api.get<OrderStatsResponse>("/orders/stats", { params });
  },

  getOrder: (orderId: string, view?: OrderView): Promise<Order> => {
    return api.get<Order>(`/orders/${orderId}`, {
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
    return `${base}/orders/${encodeURIComponent(orderId)}/invoice/download${queryString}`;
  },

  refundOrder: (
    orderId: string,
    payload: OrderDirectRefundRequest,
  ): Promise<Refund> => {
    return api.post<Refund>(`/orders/${orderId}/refund`, payload);
  },
};
