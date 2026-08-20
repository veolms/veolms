import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { OrderHistoryPage } from "../../src/order-history/OrderHistoryPage.tsx";

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

    // Check first page items
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText("#ORD-240524-1001")[0]).toBeInTheDocument();
    expect(screen.getByText("INV-1001")).toBeInTheDocument();
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
    fireEvent.change(searchInput, { target: { value: "INV-0891" } });
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

  it("filters orders by status and payment method selects", () => {
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

    // Filter by payment method
    const paymentSelect = screen.getByLabelText("Filter by payment method");
    fireEvent.change(paymentSelect, { target: { value: "paypal" } });
    expect(
      screen.getAllByText("UI/UX Design Fundamentals")[0],
    ).toBeInTheDocument();
  });

  it("navigates across pages using pagination controls", () => {
    render(<OrderHistoryPage />);

    expect(
      screen.getByText(
        (_, el) => el?.textContent?.trim() === "Showing 1 to 6 of 24 orders",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("The Ultimate TypeScript Course")[0],
    ).toBeInTheDocument();

    // Navigate to Page 2
    const page2Button = screen.getByRole("button", { name: "Page 2" });
    fireEvent.click(page2Button);

    expect(
      screen.getByText(
        (_, el) => el?.textContent?.trim() === "Showing 7 to 12 of 24 orders",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Docker & Kubernetes for Developers")[0],
    ).toBeInTheDocument();

    // Navigate with Next button
    const nextButton = screen.getByRole("button", { name: "Next page" });
    fireEvent.click(nextButton);

    expect(
      screen.getByText(
        (_, el) => el?.textContent?.trim() === "Showing 13 to 18 of 24 orders",
      ),
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
    expect(screen.getByText("Invoice INV-1001")).toBeInTheDocument();
    expect(screen.getByText("Total Paid")).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    expect(
      screen.queryByRole("heading", { name: "Order Invoice" }),
    ).not.toBeInTheDocument();
  });
});
