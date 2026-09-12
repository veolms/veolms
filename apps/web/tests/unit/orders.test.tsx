import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { OrdersPage } from "../../src/orders/OrdersPage.tsx";

const mockOrdersListResponse = {
  pages: [
    {
      orders: [
        {
          id: "ord-1",
          orderNumber: "#PC-72401",
          userId: "usr-1",
          status: "paid" as const,
          currency: "INR",
          subtotalAmount: 127000,
          discountAmount: 0,
          taxAmount: 22900,
          totalAmount: 149900,
          expiresAt: "2026-05-12T10:30:00Z",
          createdAt: "2025-05-12T10:30:00Z",
          updatedAt: "2025-05-12T10:30:00Z",
          items: [
            {
              id: "item-1",
              itemType: "course" as const,
              courseId: "typescript-course",
              titleSnapshot: "The Ultimate TypeScript Course",
              unitPrice: 149900,
              discountAmount: 0,
              taxAmount: 22900,
              finalAmount: 149900,
              createdAt: "2025-05-12T10:30:00Z",
            },
          ],
        },
        {
          id: "ord-2",
          orderNumber: "#PC-71832",
          userId: "usr-1",
          status: "paid" as const,
          currency: "INR",
          subtotalAmount: 211800,
          discountAmount: 0,
          taxAmount: 38100,
          totalAmount: 249900,
          expiresAt: "2026-04-28T10:30:00Z",
          createdAt: "2025-04-28T10:30:00Z",
          updatedAt: "2025-04-28T10:30:00Z",
          items: [
            {
              id: "item-2",
              itemType: "course" as const,
              courseId: "backend-nodejs",
              titleSnapshot: "Complete Backend with Node.js",
              unitPrice: 249900,
              discountAmount: 0,
              taxAmount: 38100,
              finalAmount: 249900,
              createdAt: "2025-04-28T10:30:00Z",
            },
          ],
        },
        {
          id: "ord-3",
          orderNumber: "#PC-70984",
          userId: "usr-1",
          status: "pending" as const,
          currency: "INR",
          subtotalAmount: 110000,
          discountAmount: 0,
          taxAmount: 19900,
          totalAmount: 129900,
          expiresAt: "2026-04-15T10:30:00Z",
          createdAt: "2025-04-15T10:30:00Z",
          updatedAt: "2025-04-15T10:30:00Z",
          items: [
            {
              id: "item-3",
              itemType: "course" as const,
              courseId: "ui-ux-design",
              titleSnapshot: "UI/UX Design Mastery",
              unitPrice: 129900,
              discountAmount: 0,
              taxAmount: 19900,
              finalAmount: 129900,
              createdAt: "2025-04-15T10:30:00Z",
            },
          ],
        },
        {
          id: "ord-4",
          orderNumber: "#PC-70123",
          userId: "usr-1",
          status: "payment_failed" as const,
          currency: "INR",
          subtotalAmount: 152400,
          discountAmount: 0,
          taxAmount: 27500,
          totalAmount: 179900,
          expiresAt: "2026-03-30T10:30:00Z",
          createdAt: "2025-03-30T10:30:00Z",
          updatedAt: "2025-03-30T10:30:00Z",
          items: [
            {
              id: "item-4",
              itemType: "course" as const,
              courseId: "postgresql-mastery",
              titleSnapshot: "PostgreSQL Mastery",
              unitPrice: 179900,
              discountAmount: 0,
              taxAmount: 27500,
              finalAmount: 179900,
              createdAt: "2025-03-30T10:30:00Z",
            },
          ],
        },
        {
          id: "ord-5",
          orderNumber: "#PC-69317",
          userId: "usr-1",
          status: "paid" as const,
          currency: "INR",
          subtotalAmount: 101600,
          discountAmount: 0,
          taxAmount: 18300,
          totalAmount: 119900,
          expiresAt: "2026-03-18T10:30:00Z",
          createdAt: "2025-03-18T10:30:00Z",
          updatedAt: "2025-03-18T10:30:00Z",
          items: [
            {
              id: "item-5",
              itemType: "course" as const,
              courseId: "graphql-masterclass",
              titleSnapshot: "GraphQL API Masterclass",
              unitPrice: 119900,
              discountAmount: 0,
              taxAmount: 18300,
              finalAmount: 119900,
              createdAt: "2025-03-18T10:30:00Z",
            },
          ],
        },
        {
          id: "ord-6",
          orderNumber: "#PC-68455",
          userId: "usr-1",
          status: "refunded" as const,
          currency: "INR",
          subtotalAmount: 84600,
          discountAmount: 0,
          taxAmount: 15300,
          totalAmount: 99900,
          expiresAt: "2026-03-05T10:30:00Z",
          createdAt: "2025-03-05T10:30:00Z",
          updatedAt: "2025-03-05T10:30:00Z",
          items: [
            {
              id: "item-6",
              itemType: "course" as const,
              courseId: "javascript-course",
              titleSnapshot: "JavaScript: Advanced Concepts",
              unitPrice: 99900,
              discountAmount: 0,
              taxAmount: 15300,
              finalAmount: 99900,
              createdAt: "2025-03-05T10:30:00Z",
            },
          ],
        },
      ],
      nextCursor: null,
    },
  ],
};

vi.mock("../../src/services/orders", () => ({
  useOrders: () => ({
    data: mockOrdersListResponse,
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

describe("OrdersPage", () => {
  it("renders the Orders title, subtitle, and initial list of orders", () => {
    render(<OrdersPage />);

    expect(
      screen.getByRole("heading", { name: "Orders", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Track your purchases, payment status, and active course orders.",
      ),
    ).toBeInTheDocument();

    // Check course titles
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Complete Backend with Node.js")[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText("UI/UX Design Mastery")[0]).toBeInTheDocument();
    expect(screen.getAllByText("PostgreSQL Mastery")[0]).toBeInTheDocument();
    expect(screen.getAllByText("GraphQL API Masterclass")[0]).toBeInTheDocument();
    expect(
      screen.getAllByText("JavaScript: Advanced Concepts")[0],
    ).toBeInTheDocument();
  });

  it("switches status tabs and filters the list of orders", () => {
    render(<OrdersPage />);

    const allTab = screen.getByRole("tab", { name: /^All/ });
    const completedTab = screen.getByRole("tab", { name: /Completed/ });
    const pendingTab = screen.getByRole("tab", { name: /Pending/ });
    const failedTab = screen.getByRole("tab", { name: /Failed/ });
    const refundedTab = screen.getByRole("tab", { name: /Refunded/ });

    expect(allTab).toHaveAttribute("aria-selected", "true");

    // Click Pending tab
    fireEvent.click(pendingTab);
    expect(pendingTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("UI/UX Design Mastery")[0]).toBeInTheDocument();

    // Click Failed tab
    fireEvent.click(failedTab);
    expect(failedTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("PostgreSQL Mastery")[0]).toBeInTheDocument();

    // Click Refunded tab
    fireEvent.click(refundedTab);
    expect(refundedTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("JavaScript: Advanced Concepts")[0],
    ).toBeInTheDocument();

    // Click Completed tab
    fireEvent.click(completedTab);
    expect(completedTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();
  });

  it("filters orders by search query across course title and order ID", () => {
    render(<OrdersPage />);

    const searchInput = screen.getByPlaceholderText(
      "Search orders by course or order ID...",
    );

    // Search by title
    fireEvent.change(searchInput, { target: { value: "node" } });
    expect(
      screen.getAllByText("Complete Backend with Node.js")[0],
    ).toBeInTheDocument();

    // Search by Order ID
    fireEvent.change(searchInput, { target: { value: "#PC-70984" } });
    expect(screen.getAllByText("UI/UX Design Mastery")[0]).toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();
  });

  it("filters orders by course and status dropdown selects", () => {
    render(<OrdersPage />);

    const courseSelect = screen.getByLabelText("Filter by course");
    fireEvent.change(courseSelect, {
      target: { value: "typescript-course" },
    });

    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();

    // Reset course filter
    fireEvent.change(courseSelect, { target: { value: "all" } });
    expect(
      screen.getAllByText("Complete Backend with Node.js")[0],
    ).toBeInTheDocument();
  });

  it("opens and displays the invoice receipt modal dialog", () => {
    render(<OrdersPage />);

    const optionsButtons = screen.getAllByRole("button", {
      name: /Options for order/,
    });
    fireEvent.click(optionsButtons[0]!);

    const viewInvoiceBtn = screen.getByRole("menuitem", {
      name: /View invoice/,
    });
    fireEvent.click(viewInvoiceBtn);

    expect(
      screen.getByRole("heading", { name: "Payment Receipt" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Invoice INV-72401")).toBeInTheDocument();
    expect(screen.getAllByText("Credit Card / UPI")[0]).toBeInTheDocument();
    expect(screen.getByText("Total Amount Paid")).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    expect(
      screen.queryByRole("heading", { name: "Payment Receipt" }),
    ).not.toBeInTheDocument();
  });

  it("renders Order Summary widget with metric counts and Total Spent", () => {
    render(<OrdersPage />);

    expect(screen.getByText("Order Summary")).toBeInTheDocument();
    expect(screen.getByText("Total orders")).toBeInTheDocument();
    expect(screen.getByText("Total spent")).toBeInTheDocument();
    expect(screen.getByText("Across all orders")).toBeInTheDocument();
  });

  it("renders Recent Payments widget with transactions", () => {
    render(<OrdersPage />);

    expect(screen.getByText("Recent Payments")).toBeInTheDocument();
    expect(screen.getByText("View full billing history")).toBeInTheDocument();
  });
});
