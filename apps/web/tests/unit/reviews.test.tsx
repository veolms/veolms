import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { ReviewsPage } from "../../src/reviews/ReviewsPage.tsx";

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

describe("ReviewsPage", () => {
  it("renders the course review header and main title", () => {
    render(<ReviewsPage />);

    expect(screen.getByRole("heading", { name: "Reviews", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("The Ultimate TypeScript Course")).toBeInTheDocument();
    expect(screen.getByText("TS")).toBeInTheDocument();
    expect(screen.getByText(/Last updated 2 days ago/)).toBeInTheDocument();
  });

  it("renders tab navigation and allows switching tabs", () => {
    render(<ReviewsPage />);

    const allTab = screen.getByRole("tab", { name: /All Reviews/ });
    const commentsTab = screen.getByRole("tab", { name: /With Comments/ });
    const highestTab = screen.getByRole("tab", { name: /Highest Rated/ });
    const lowestTab = screen.getByRole("tab", { name: /Lowest Rated/ });
    const myReviewTab = screen.getByRole("tab", { name: /My Review/ });

    expect(allTab).toHaveAttribute("aria-selected", "true");
    expect(commentsTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(lowestTab);
    expect(lowestTab).toHaveAttribute("aria-selected", "true");
    expect(allTab).toHaveAttribute("aria-selected", "false");

    // Switching to My Review
    fireEvent.click(myReviewTab);
    expect(myReviewTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Ashi Singh")[0]).toBeInTheDocument();
  });

  it("allows searching reviews by text query", () => {
    render(<ReviewsPage />);

    const searchInput = screen.getByPlaceholderText("Search reviews...");
    expect(screen.getAllByText("Ashi Singh")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Anurag Singh")[0]).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "lengthy" } });
    expect(screen.getAllByText("Anurag Singh")[0]).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Very detailed course, but could include more real-world production projects.",
      ),
    ).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getAllByText("Ashi Singh")[0]).toBeInTheDocument();
  });

  it("allows toggling the verified learners filter", () => {
    render(<ReviewsPage />);

    const verifiedToggle = screen.getByRole("checkbox", {
      name: /Verified learners/,
    });
    expect(verifiedToggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(verifiedToggle);
    expect(verifiedToggle).toHaveAttribute("aria-checked", "true");
  });

  it("allows toggling helpful votes on reviews", () => {
    render(<ReviewsPage />);

    const helpfulButtons = screen.getAllByRole("button", { name: /found this helpful/ });
    const firstHelpful = helpfulButtons[0]!;

    expect(firstHelpful).toHaveTextContent("12");
    fireEvent.click(firstHelpful);
    expect(firstHelpful).toHaveTextContent("13");
    fireEvent.click(firstHelpful);
    expect(firstHelpful).toHaveTextContent("12");
  });

  it("opens and submits a new review via the Write Review modal", () => {
    const setNotice = vi.fn();
    render(<ReviewsPage setNotice={setNotice} />);

    const writeButton = screen.getByRole("button", { name: /Write a review/ });
    fireEvent.click(writeButton);

    expect(screen.getByRole("heading", { name: "Write a review" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Review headline"), {
      target: { value: "Superb explanations and deep dive!" },
    });
    fireEvent.change(screen.getByLabelText("Detailed review"), {
      target: { value: "Loved the modules on advanced generics and conditional types." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));

    expect(setNotice).toHaveBeenCalledWith("Your review has been submitted successfully!");
    expect(screen.getByText("Superb explanations and deep dive!")).toBeInTheDocument();
  });

  it("renders rating summary, highlights, top reviewers, and need help widget", () => {
    render(<ReviewsPage />);

    expect(screen.getAllByText("Rating summary")[0]).toBeInTheDocument();
    expect(screen.getAllByText("4.8")[0]).toBeInTheDocument();
    expect(screen.getByText("Highlights")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getByText("Top reviewers")).toBeInTheDocument();
    expect(screen.getByText("Need help?")).toBeInTheDocument();
  });
});
