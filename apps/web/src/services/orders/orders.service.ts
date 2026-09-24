import { api, getApiBaseUrl } from "../../lib/api-client";
import type {
  Order,
  OrdersListResponse,
  Invoice,
} from "@veolms/contracts";

export const ordersService = {
  listOrders: (params?: {
    cursor?: string;
    limit?: number;
  }): Promise<OrdersListResponse> => {
    return api.get<OrdersListResponse>("/orders", { params });
  },

  getOrder: (orderId: string): Promise<Order> => {
    return api.get<Order>(`/orders/${orderId}`);
  },

  getInvoice: (orderId: string): Promise<Invoice> => {
    return api.get<Invoice>(`/orders/${orderId}/invoice`);
  },

  getInvoiceDownloadUrl: (orderId: string): string => {
    const base = getApiBaseUrl();
    return `${base}/orders/${orderId}/invoice/download`;
  },
};
