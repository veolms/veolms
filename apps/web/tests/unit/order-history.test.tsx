import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { OrderHistoryPage } from "../../src/order-history/OrderHistoryPage.tsx";

const mockHistoryOrders = [
  {
    id: "ord-hist-1",
    orderNumber: "#ORD-240524-1001",
    userId: "usr-1",
    status: "paid" as const,
    currency: "USD",
    subtotalAmount: 4153,
    discountAmount: 0,
    taxAmount: 747,
    totalAmount: 4900,
    expiresAt: "2026-05-24T10:30:00Z",
    createdAt: "2025-05-24T10:30:00Z",
    updatedAt: "2025-05-24T10:30:00Z",
    items: [
      {
        id: "item-1",
        itemType: "course" as const,
        courseId: "typescript-course",
        titleSnapshot: "The Ultimate TypeScript Course",
        unitPrice: 4900,
        discountAmount: 0,
        taxAmount: 747,
        finalAmount: 4900,
        createdAt: "2025-05-24T10:30:00Z",
      },
    ],
  },
  {
    id: "ord-hist-2",
    orderNumber: "#ORD-240523-0987",
    userId: "usr-1",
    status: "payment_processing" as const,
    currency: "USD",
    subtotalAmount: 5000,
    discountAmount: 0,
    taxAmount: 900,
    totalAmount: 5900,
    expiresAt: "2026-05-23T09:15:00Z",
    createdAt: "2025-05-23T09:15:00Z",
    updatedAt: "2025-05-23T09:15:00Z",
    items: [
      {
        id: "item-2",
        itemType: "course" as const,
        courseId: "backend-nodejs",
        titleSnapshot: "Complete Backend with Node.js",
        unitPrice: 5900,
        discountAmount: 0,
        taxAmount: 900,
        finalAmount: 5900,
        createdAt: "2025-05-23T09:15:00Z",
      },
    ],
  },
  {
    id: "ord-hist-3",
    orderNumber: "#ORD-240522-0966",
    userId: "usr-1",
    status: "paid" as const,
    currency: "USD",
    subtotalAmount: 3305,
    discountAmount: 0,
    taxAmount: 595,
    totalAmount: 3900,
    expiresAt: "2026-05-22T16:45:00Z",
    createdAt: "2025-05-22T16:45:00Z",
    updatedAt: "2025-05-22T16:45:00Z",
    items: [
      {
        id: "item-3",
        itemType: "course" as const,
        courseId: "python-data-science",
        titleSnapshot: "Python for Data Science",
        unitPrice: 3900,
        discountAmount: 0,
        taxAmount: 595,
        finalAmount: 3900,
        createdAt: "2025-05-22T16:45:00Z",
      },
    ],
  },
  {
    id: "ord-hist-4",
    orderNumber: "#ORD-240521-0923",
    userId: "usr-1",
    status: "payment_failed" as const,
    currency: "USD",
    subtotalAmount: 4153,
    discountAmount: 0,
    taxAmount: 747,
    totalAmount: 4900,
    expiresAt: "2026-05-21T11:20:00Z",
    createdAt: "2025-05-21T11:20:00Z",
    updatedAt: "2025-05-21T11:20:00Z",
    items: [
      {
        id: "item-4",
        itemType: "course" as const,
        courseId: "react-complete-guide",
        titleSnapshot: "React.js - The Complete Guide",
        unitPrice: 4900,
        discountAmount: 0,
        taxAmount: 747,
        finalAmount: 4900,
        createdAt: "2025-05-21T11:20:00Z",
      },
    ],
  },
  {
    id: "ord-hist-5",
    orderNumber: "#ORD-240520-0891",
    userId: "usr-1",
    status: "refunded" as const,
    currency: "USD",
    subtotalAmount: 2458,
    discountAmount: 0,
    taxAmount: 442,
    totalAmount: 2900,
    expiresAt: "2026-05-20T14:10:00Z",
    createdAt: "2025-05-20T14:10:00Z",
    updatedAt: "2025-05-20T14:10:00Z",
    items: [
      {
        id: "item-5",
        itemType: "course" as const,
        courseId: "ui-ux-design-fundamentals",
        titleSnapshot: "UI/UX Design Fundamentals",
        unitPrice: 2900,
        discountAmount: 0,
        taxAmount: 442,
        finalAmount: 2900,
        createdAt: "2025-05-20T14:10:00Z",
      },
    ],
  },
];

vi.mock("../../src/services/orders", () => ({
  useOrders: () => ({
    data: {
      pages: [{ orders: mockHistoryOrders, nextCursor: null }],
    },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
  ordersService: {
    getInvoiceDownloadUrl: (id: string) => `/api/v1/orders/${id}/invoice/download`,
  },
}));

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    value,
    onValueChange,
    options,
  }: {
    ariaLabel: string;
    value: string;
    onValueChange: (val: string) => void;
    options: readonly [string, string][];
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  ),
}));

describe("OrderHistoryPage", () => {
  it("renders Order History title, description, and initial table data", () => {
    render(<OrderHistoryPage />);

    expect(
      screen.getByRole("heading", { name: "Order History", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Review your academy purchases and payment activity."),
    ).toBeInTheDocument();

    // Check table headers
    expect(screen.getByText("ORDER")).toBeInTheDocument();
    expect(screen.getByText("COURSE / ITEM")).toBeInTheDocument();
    expect(screen.getByText("DATE")).toBeInTheDocument();
    expect(screen.getByText("PAYMENT METHOD")).toBeInTheDocument();
    expect(screen.getByText("AMOUNT")).toBeInTheDocument();
    expect(screen.getByText("STATUS")).toBeInTheDocument();

    // Check items
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText("#ORD-240524-1001")[0]).toBeInTheDocument();
    expect(screen.getByText("INV-240524-1001")).toBeInTheDocument();
  });

  it("switches status tabs and filters the orders table", () => {
    render(<OrderHistoryPage />);

    const allTab = screen.getByRole("tab", { name: /All Orders/ });
    const processingTab = screen.getByRole("tab", { name: /Processing/ });
    const refundedTab = screen.getByRole("tab", { name: /Refunded/ });
    const failedTab = screen.getByRole("tab", { name: /Failed/ });

    expect(allTab).toHaveAttribute("aria-selected", "true");

    // Click Processing tab
    fireEvent.click(processingTab);
    expect(processingTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("Complete Backend with Node.js")[0],
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The Ultimate TypeScript Course"),
    ).not.toBeInTheDocument();

    // Click Refunded tab
    fireEvent.click(refundedTab);
    expect(refundedTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("UI/UX Design Fundamentals")[0],
    ).toBeInTheDocument();

    // Click Failed tab
    fireEvent.click(failedTab);
    expect(failedTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("React.js - The Complete Guide")[0],
    ).toBeInTheDocument();
  });

  it("filters orders by search query across Order ID, invoice, and course title", () => {
    render(<OrderHistoryPage />);

    const searchInput = screen.getByPlaceholderText(
      "Search by order ID, course, or invoice...",
    );

    // Search by title
    fireEvent.change(searchInput, { target: { value: "Python" } });
    expect(
      screen.getAllByText("Python for Data Science")[0],
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The Ultimate TypeScript Course"),
    ).not.toBeInTheDocument();

    // Search by Invoice ID
    fireEvent.change(searchInput, { target: { value: "INV-240520-0891" } });
    expect(
      screen.getAllByText("UI/UX Design Fundamentals")[0],
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Python for Data Science"),
    ).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();
  });

  it("filters orders by status dropdown select", () => {
    render(<OrderHistoryPage />);

    const statusSelect = screen.getByLabelText("Filter by status");
    fireEvent.change(statusSelect, { target: { value: "refunded" } });

    expect(
      screen.getAllByText("UI/UX Design Fundamentals")[0],
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The Ultimate TypeScript Course"),
    ).not.toBeInTheDocument();

    // Reset status
    fireEvent.change(statusSelect, { target: { value: "all" } });
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();
  });

  it("opens and displays the invoice receipt modal dialog", () => {
    render(<OrderHistoryPage />);

    const optionsButtons = screen.getAllByRole("button", {
      name: /Options for #ORD/,
    });
    fireEvent.click(optionsButtons[0]!);

    const viewInvoiceBtn = screen.getByRole("menuitem", {
      name: /View invoice/,
    });
    fireEvent.click(viewInvoiceBtn);

    expect(
      screen.getByRole("heading", { name: "Order Invoice" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Invoice INV-240524-1001")).toBeInTheDocument();
    expect(screen.getByText("Total Paid")).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    expect(
      screen.queryByRole("heading", { name: "Order Invoice" }),
    ).not.toBeInTheDocument();
  });
});
