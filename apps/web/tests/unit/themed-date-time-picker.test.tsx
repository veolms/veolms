import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemedDateTimePicker } from "../../src/ThemedDateTimePicker";

function TestPickerWrapper({
  initialValue = "",
  onChange = vi.fn(),
}: {
  initialValue?: string;
  onChange?: (val: string) => void;
}) {
  const [val, setVal] = useState(initialValue);
  return (
    <ThemedDateTimePicker
      ariaLabel="Test Date Time"
      value={val}
      onChange={(next) => {
        setVal(next);
        onChange(next);
      }}
      placeholder="dd/mm/yyyy --:--"
    />
  );
}

describe("ThemedDateTimePicker", () => {
  it("renders placeholder when value is empty", () => {
    render(<TestPickerWrapper initialValue="" />);
    expect(screen.getByText("dd/mm/yyyy --:--")).toBeDefined();
  });

  it("renders formatted date string when value is provided", () => {
    render(<TestPickerWrapper initialValue="2026-09-11T16:44" />);
    expect(screen.getByText("11 Sep 2026, 16:44")).toBeDefined();
  });

  it("opens popover when trigger is clicked and displays calendar", () => {
    render(<TestPickerWrapper initialValue="2026-09-11T16:44" />);
    const trigger = screen.getByRole("button", { name: /Test Date Time/ });
    fireEvent.click(trigger);

    expect(screen.getByText("September 2026")).toBeDefined();
    expect(screen.getByText("Time")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("calls onChange when selecting a day", () => {
    const handleChange = vi.fn();
    render(
      <TestPickerWrapper
        initialValue="2026-09-11T16:44"
        onChange={handleChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Test Date Time/ });
    fireEvent.click(trigger);

    // Click day 15 September 2026
    const day15Btn = screen.getByRole("button", { name: "15 September 2026" });
    fireEvent.click(day15Btn);

    expect(handleChange).toHaveBeenCalledWith("2026-09-15T16:44");
  });

  it("calls onChange with updated hour and minute", () => {
    const handleChange = vi.fn();
    render(
      <TestPickerWrapper
        initialValue="2026-09-11T16:44"
        onChange={handleChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Test Date Time/ });
    fireEvent.click(trigger);

    // Click hour '18'
    const hour18Btn = screen.getByRole("button", { name: "Hour 18" });
    fireEvent.click(hour18Btn);
    expect(handleChange).toHaveBeenCalledWith("2026-09-11T18:44");

    // Click minute '30'
    const min30Btn = screen.getByRole("button", { name: "Minute 30" });
    fireEvent.click(min30Btn);
    expect(handleChange).toHaveBeenCalledWith("2026-09-11T18:30");
  });

  it("clears value when clear icon on trigger is clicked", () => {
    const handleChange = vi.fn();
    render(
      <TestPickerWrapper
        initialValue="2026-09-11T16:44"
        onChange={handleChange}
      />,
    );
    const clearBtn = screen.getByRole("button", {
      name: "Clear date and time",
    });
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith("");
  });
});
