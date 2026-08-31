import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemedSelect } from "../../src/ThemedSelect.tsx";
import type { ThemedSelectOption } from "../../src/ThemedSelect.tsx";
import { CountryFlag } from "../../src/auth/CountryFlag.tsx";

const sampleOptions: readonly ThemedSelectOption[] = [
  [
    "IN",
    "+91",
    {
      flag: "🇮🇳",
      label: "India (+91)",
      searchKeywords: "India +91 IN",
    },
  ],
  [
    "US",
    "+1",
    {
      flag: "🇺🇸",
      label: "United States (+1)",
      searchKeywords: "United States +1 US",
    },
  ],
  [
    "GB",
    "+44",
    {
      flag: "🇬🇧",
      label: "United Kingdom (+44)",
      searchKeywords: "United Kingdom +44 GB",
    },
  ],
  [
    "AE",
    "+971",
    {
      flag: "🇦🇪",
      label: "United Arab Emirates (+971)",
      searchKeywords: "United Arab Emirates +971 AE",
    },
  ],
];

function TestSelectWrapper({
  searchable = true,
  onValueChange = vi.fn(),
}: {
  searchable?: boolean;
  onValueChange?: (val: string) => void;
}) {
  const [val, setVal] = useState("IN");
  return (
    <ThemedSelect
      ariaLabel="Country code"
      options={sampleOptions}
      value={val}
      onValueChange={(next) => {
        setVal(next);
        onValueChange(next);
      }}
      searchable={searchable}
      searchPlaceholder="Search country or code..."
    />
  );
}

describe("ThemedSelect with search and flags", () => {
  it("renders the selected value and flag in the trigger", () => {
    render(<TestSelectWrapper />);
    const trigger = screen.getByRole("button", { name: /Country code: \+91/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("🇮🇳");
    expect(trigger).toHaveTextContent("+91");
  });

  it("opens the dropdown with search input on click", () => {
    render(<TestSelectWrapper />);
    const trigger = screen.getByRole("button", { name: /Country code: \+91/i });
    fireEvent.click(trigger);

    expect(
      screen.getByPlaceholderText("Search country or code..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByText("India (+91)")).toBeInTheDocument();
    expect(screen.getByText("United States (+1)")).toBeInTheDocument();
  });

  it("filters countries by name or dial code when user searches", () => {
    render(<TestSelectWrapper />);
    fireEvent.click(
      screen.getByRole("button", { name: /Country code: \+91/i }),
    );

    const searchInput = screen.getByPlaceholderText(
      "Search country or code...",
    );
    fireEvent.change(searchInput, { target: { value: "united" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByText("United States (+1)")).toBeInTheDocument();
    expect(screen.getByText("United Kingdom (+44)")).toBeInTheDocument();
    expect(screen.getByText("United Arab Emirates (+971)")).toBeInTheDocument();
    expect(screen.queryByText("India (+91)")).not.toBeInTheDocument();
  });

  it("selects a country and updates trigger value", () => {
    const onValueChange = vi.fn();
    render(<TestSelectWrapper onValueChange={onValueChange} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Country code: \+91/i }),
    );

    const usOption = screen.getByText("United States (+1)");
    fireEvent.click(usOption);

    expect(onValueChange).toHaveBeenCalledWith("US");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Country code: \+1/i }),
    ).toBeInTheDocument();
  });

  it("shows empty message when no countries match query", () => {
    render(<TestSelectWrapper />);
    fireEvent.click(
      screen.getByRole("button", { name: /Country code: \+91/i }),
    );

    const searchInput = screen.getByPlaceholderText(
      "Search country or code...",
    );
    fireEvent.change(searchInput, { target: { value: "xyznonexistent" } });

    expect(screen.getByText("No results found")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("renders CountryFlag graphic without regional indicator fallback text", () => {
    const { container } = render(<CountryFlag code="IN" />);
    expect(container.querySelector("img, svg")).not.toBeNull();
  });

  it("allows navigating to and activating the action button via keyboard", () => {
    const onActionSelect = vi.fn();
    render(
      <ThemedSelect
        ariaLabel="Country code"
        options={sampleOptions}
        value="IN"
        onValueChange={vi.fn()}
        searchable={true}
        action={{
          label: "Add New Country",
          onSelect: onActionSelect,
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Country code: \+91/i });
    fireEvent.click(trigger);

    const searchInput = screen.getByRole("textbox");
    const actionBtn = screen.getByRole("button", { name: "Add New Country" });

    expect(actionBtn).toBeInTheDocument();
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    // From search input, ArrowUp moves focus to action button
    fireEvent.keyDown(searchInput, { key: "ArrowUp" });
    expect(document.activeElement).toBe(actionBtn);

    // From action button, ArrowDown moves focus back to search input
    fireEvent.keyDown(actionBtn, { key: "ArrowDown" });
    expect(document.activeElement).toBe(searchInput);

    // Navigate to first option with ArrowDown
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(document.activeElement).toBe(options[0]);

    // End from option moves focus to action button
    fireEvent.keyDown(options[0]!, { key: "End" });
    expect(document.activeElement).toBe(actionBtn);

    // Clicking action button activates onSelect and closes menu
    fireEvent.click(actionBtn);
    expect(onActionSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("navigates to action button when search returns no results", () => {
    const onActionSelect = vi.fn();
    render(
      <ThemedSelect
        ariaLabel="Country code"
        options={sampleOptions}
        value="IN"
        onValueChange={vi.fn()}
        searchable={true}
        searchPlaceholder="Search country..."
        action={{
          label: "Create Custom Option",
          onSelect: onActionSelect,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Country code: \+91/i }));

    const searchInput = screen.getByPlaceholderText("Search country...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });
    searchInput.focus();

    const actionBtn = screen.getByRole("button", { name: "Create Custom Option" });

    // With 0 filtered options, ArrowDown moves focus directly to action button
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    expect(document.activeElement).toBe(actionBtn);

    // ArrowUp from action button moves back to search input
    fireEvent.keyDown(actionBtn, { key: "ArrowUp" });
    expect(document.activeElement).toBe(searchInput);
  });
});

