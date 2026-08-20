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

export type OrderTabId = "all" | "completed" | "pending" | "failed" | "refunded";

export const initialOrdersList: readonly OrderItem[] = [
  {
    id: "ord-1",
    orderNumber: "#PC-72401",
    courseId: "typescript-course",
    courseTitle: "The Ultimate TypeScript Course",
    badgeText: "TS",
    badgeColor: "#2563eb",
    badgeTextColor: "#ffffff",
    date: "May 12, 2025",
    paymentMethod: "Credit Card",
    price: 1499,
    formattedPrice: "₹1,499",
    status: "completed",
    statusLabel: "Completed",
    invoiceNumber: "INV-2025-0589",
    transactionId: "TXN_9845729104",
    subtotal: 1270,
    tax: 229,
  },
  {
    id: "ord-2",
    orderNumber: "#PC-71832",
    courseId: "backend-nodejs",
    courseTitle: "Complete Backend with Node.js",
    badgeText: "node",
    badgeColor: "#1e293b",
    badgeTextColor: "#4ade80",
    date: "Apr 28, 2025",
    paymentMethod: "UPI",
    price: 2499,
    formattedPrice: "₹2,499",
    status: "completed",
    statusLabel: "Completed",
    invoiceNumber: "INV-2025-0512",
    transactionId: "UPI_7836109482",
    subtotal: 2118,
    tax: 381,
  },
  {
    id: "ord-3",
    orderNumber: "#PC-70984",
    courseId: "ui-ux-design",
    courseTitle: "UI/UX Design Mastery",
    badgeText: "UI",
    badgeColor: "#8b5cf6",
    badgeTextColor: "#ffffff",
    date: "Apr 15, 2025",
    paymentMethod: "Credit Card",
    price: 1299,
    formattedPrice: "₹1,299",
    status: "pending",
    statusLabel: "Pending",
    invoiceNumber: "INV-2025-0466",
    transactionId: "TXN_5628103947",
    subtotal: 1100,
    tax: 199,
  },
  {
    id: "ord-4",
    orderNumber: "#PC-70123",
    courseId: "postgresql-mastery",
    courseTitle: "PostgreSQL Mastery",
    badgeText: "PG",
    badgeColor: "#0284c7",
    badgeTextColor: "#ffffff",
    date: "Mar 30, 2025",
    paymentMethod: "Net Banking",
    price: 1799,
    formattedPrice: "₹1,799",
    status: "failed",
    statusLabel: "Failed",
    invoiceNumber: "INV-2025-0391",
    transactionId: "NB_3920194857",
    subtotal: 1524,
    tax: 275,
  },
  {
    id: "ord-5",
    orderNumber: "#PC-69317",
    courseId: "graphql-masterclass",
    courseTitle: "GraphQL API Masterclass",
    badgeText: "GQL",
    badgeColor: "#ec4899",
    badgeTextColor: "#ffffff",
    date: "Mar 18, 2025",
    paymentMethod: "UPI",
    price: 1199,
    formattedPrice: "₹1,199",
    status: "completed",
    statusLabel: "Completed",
    invoiceNumber: "INV-2025-0338",
    transactionId: "UPI_6104829375",
    subtotal: 1016,
    tax: 183,
  },
  {
    id: "ord-6",
    orderNumber: "#PC-68455",
    courseId: "javascript-course",
    courseTitle: "JavaScript: Advanced Concepts",
    badgeText: "JS",
    badgeColor: "#eab308",
    badgeTextColor: "#000000",
    date: "Mar 05, 2025",
    paymentMethod: "Credit Card",
    price: 999,
    formattedPrice: "₹999",
    status: "refunded",
    statusLabel: "Refunded",
    invoiceNumber: "INV-2025-0284",
    transactionId: "REF_1948205938",
    subtotal: 846,
    tax: 153,
  },
];

export const initialOrderSummary: OrderSummaryMetrics = {
  totalOrders: 24,
  completed: 16,
  pending: 4,
  failed: 2,
  refunded: 2,
  totalSpent: "₹15,293",
  totalSpentAmount: 15293,
};

export const initialRecentPayments: readonly RecentPaymentItem[] = [
  {
    id: "rec-1",
    courseTitle: "The Ultimate TypeScript Course",
    badgeText: "TS",
    badgeColor: "#2563eb",
    badgeTextColor: "#ffffff",
    date: "May 12, 2025",
    status: "completed",
    statusLabel: "Completed",
    formattedPrice: "₹1,499",
  },
  {
    id: "rec-2",
    courseTitle: "Complete Backend with Node.js",
    badgeText: "node",
    badgeColor: "#1e293b",
    badgeTextColor: "#4ade80",
    date: "Apr 28, 2025",
    status: "completed",
    statusLabel: "Completed",
    formattedPrice: "₹2,499",
  },
  {
    id: "rec-3",
    courseTitle: "UI/UX Design Mastery",
    badgeText: "UI",
    badgeColor: "#8b5cf6",
    badgeTextColor: "#ffffff",
    date: "Apr 15, 2025",
    status: "pending",
    statusLabel: "Pending",
    formattedPrice: "₹1,299",
  },
  {
    id: "rec-4",
    courseTitle: "PostgreSQL Mastery",
    badgeText: "PG",
    badgeColor: "#0284c7",
    badgeTextColor: "#ffffff",
    date: "Mar 30, 2025",
    status: "failed",
    statusLabel: "Failed",
    formattedPrice: "₹1,799",
  },
];
