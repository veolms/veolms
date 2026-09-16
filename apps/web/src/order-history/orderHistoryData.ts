export type OrderHistoryStatus =
  | "completed"
  | "processing"
  | "refunded"
  | "failed"
  | "canceled";

export interface OrderHistoryPayment {
  type: "visa" | "mastercard" | "upi" | "paypal";
  label: string; // e.g. "•••• 4242", "ashisingh@upi", "ashisingh@example.com"
  brand: string; // e.g. "Visa", "Mastercard", "UPI", "PayPal"
}

export interface OrderHistoryItem {
  id: string;
  orderNumber: string; // e.g. "#ORD-240524-1001"
  invoiceNumber: string; // e.g. "INV-1001"
  courseId: string;
  courseTitle: string;
  itemCount: string; // e.g. "1 Course"
  iconColor: string; // e.g. "#3b82f6"
  date: string; // e.g. "May 24, 2025"
  time: string; // e.g. "10:30 AM"
  payment: OrderHistoryPayment;
  amount: number; // in USD
  formattedAmount: string; // e.g. "$49.00"
  status: OrderHistoryStatus;
  statusLabel: string;
  subtotal: number;
  tax: number;
  transactionId: string;
}

export type OrderHistoryTabId =
  | "all"
  | "completed"
  | "processing"
  | "refunded"
  | "failed"
  | "canceled";
/*
// LEGACY MOCK DATA REFERENCE:
export const initialOrderHistoryList: readonly OrderHistoryItem[] = [
  // Page 1
  {
    id: "ord-hist-1",
    orderNumber: "#ORD-240524-1001",
    invoiceNumber: "INV-1001",
    courseId: "typescript-course",
    courseTitle: "The Ultimate TypeScript Course",
    itemCount: "1 Course",
    iconColor: "#3b82f6", // Blue
    date: "May 24, 2025",
    time: "10:30 AM",
    payment: {
      type: "visa",
      brand: "Visa",
      label: "•••• 4242",
    },
    amount: 49.0,
    formattedAmount: "$49.00",
    status: "completed",
    statusLabel: "Completed",
    subtotal: 41.53,
    tax: 7.47,
    transactionId: "TXN_VISA_9845729104",
  },
  {
    id: "ord-hist-2",
    orderNumber: "#ORD-240523-0987",
    invoiceNumber: "INV-0987",
    courseId: "backend-nodejs",
    courseTitle: "Complete Backend with Node.js",
    itemCount: "1 Course",
    iconColor: "#f59e0b", // Amber/Orange
    date: "May 23, 2025",
    time: "09:15 AM",
    payment: {
      type: "mastercard",
      brand: "Mastercard",
      label: "•••• 1234",
    },
    amount: 59.0,
    formattedAmount: "$59.00",
    status: "processing",
    statusLabel: "Processing",
    subtotal: 50.0,
    tax: 9.0,
    transactionId: "TXN_MC_7836109482",
  },
  {
    id: "ord-hist-3",
    orderNumber: "#ORD-240522-0966",
    invoiceNumber: "INV-0966",
    courseId: "python-data-science",
    courseTitle: "Python for Data Science",
    itemCount: "1 Course",
    iconColor: "#10b981", // Green
    date: "May 22, 2025",
    time: "04:45 PM",
    payment: {
      type: "upi",
      brand: "UPI",
      label: "ashisingh@upi",
    },
    amount: 39.0,
    formattedAmount: "$39.00",
    status: "completed",
    statusLabel: "Completed",
    subtotal: 33.05,
    tax: 5.95,
    transactionId: "UPI_5628103947",
  },
  {
    id: "ord-hist-4",
    orderNumber: "#ORD-240521-0923",
    invoiceNumber: "INV-0923",
    courseId: "react-complete-guide",
    courseTitle: "React.js - The Complete Guide",
    itemCount: "1 Course",
    iconColor: "#8b5cf6", // Purple
    date: "May 21, 2025",
    time: "11:20 AM",
    payment: {
      type: "visa",
      brand: "Visa",
      label: "•••• 4242",
    },
    amount: 49.0,
    formattedAmount: "$49.00",
    status: "failed",
    statusLabel: "Failed",
    subtotal: 41.53,
    tax: 7.47,
    transactionId: "TXN_VISA_3920194857",
  },
  {
    id: "ord-hist-5",
    orderNumber: "#ORD-240520-0891",
    invoiceNumber: "INV-0891",
    courseId: "ui-ux-design-fundamentals",
    courseTitle: "UI/UX Design Fundamentals",
    itemCount: "1 Course",
    iconColor: "#ef4444", // Red
    date: "May 20, 2025",
    time: "02:10 PM",
    payment: {
      type: "paypal",
      brand: "PayPal",
      label: "ashisingh@example.com",
    },
    amount: 29.0,
    formattedAmount: "$29.00",
    status: "refunded",
    statusLabel: "Refunded",
    subtotal: 24.58,
    tax: 4.42,
    transactionId: "PAYPAL_6104829375",
  },
  {
    id: "ord-hist-6",
    orderNumber: "#ORD-240519-0860",
    invoiceNumber: "INV-0860",
    courseId: "javascript-zero-to-hero",
    courseTitle: "JavaScript: From Zero to Hero",
    itemCount: "1 Course",
    iconColor: "#f97316", // Orange
    date: "May 19, 2025",
    time: "08:00 AM",
    payment: {
      type: "mastercard",
      brand: "Mastercard",
      label: "•••• 1234",
    },
    amount: 49.0,
    formattedAmount: "$49.00",
    status: "canceled",
    statusLabel: "Canceled",
    subtotal: 41.53,
    tax: 7.47,
    transactionId: "TXN_MC_1948205938",
  },
];

export const orderHistoryTabCounts = {
  all: 0,
  completed: 0,
  processing: 0,
  refunded: 0,
  failed: 0,
  canceled: 0,
};
*/
