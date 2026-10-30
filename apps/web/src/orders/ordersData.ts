export type OrderStatus = "completed" | "pending" | "failed" | "refunded";

export interface OrderItem {
  id: string;
  orderNumber: string; // e.g. "#PC-72401"
  courseId: string;
  courseTitle: string;
  badgeText: string;
  badgeColor: string;
  badgeTextColor?: string;
  date: string;
  paymentMethod: string;
  price: number; // in INR
  formattedPrice: string; // e.g. "₹1,499"
  status: OrderStatus;
  statusLabel: string;
  invoiceNumber: string;
  transactionId: string;
  tax: number;
  subtotal: number;
  /** ISO 4217 code of the order; defaults to INR when absent. */
  currency?: string;
}

export interface OrderSummaryMetrics {
  totalOrders: number;
  completed: number;
  pending: number;
  failed: number;
  refunded: number;
  totalSpent: string;
  totalSpentAmount: number;
}

export interface RecentPaymentItem {
  id: string;
  courseTitle: string;
  badgeText: string;
  badgeColor: string;
  badgeTextColor?: string;
  date: string;
  status: OrderStatus;
  statusLabel: string;
  formattedPrice: string;
}

export type OrderTabId =
  "all" | "completed" | "pending" | "failed" | "refunded";
