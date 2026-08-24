import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { OrdersPage } from "../../src/orders/OrdersPage.tsx";

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
    expect(screen.getByText("Invoice INV-2025-0589")).toBeInTheDocument();
    expect(screen.getAllByText("Credit Card")[0]).toBeInTheDocument();
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
    expect(screen.getByText("₹15,293")).toBeInTheDocument();
    expect(screen.getByText("Across all orders")).toBeInTheDocument();
  });

  it("renders Recent Payments widget with transactions", () => {
    render(<OrdersPage />);

    expect(screen.getByText("Recent Payments")).toBeInTheDocument();
    expect(screen.getByText("View full billing history")).toBeInTheDocument();
  });
});
