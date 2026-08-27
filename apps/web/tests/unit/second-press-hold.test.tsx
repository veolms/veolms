import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSecondPressHold } from "../../src/gestures/useSecondPressHold";

function GestureHarness({ deferFirstPress = false }) {
  const [presses, setPresses] = useState(0);
  const [holds, setHolds] = useState(0);
  const gesture = useSecondPressHold<HTMLButtonElement>({
    deferFirstPress,
    onPress: () => setPresses((count) => count + 1),
    onSecondPressHold: () => setHolds((count) => count + 1),
  });

  return (
    <>
      <button
        type="button"
        data-second-press-holding={gesture.isSecondPressHolding || undefined}
        {...gesture.handlers}
      >
        Toggle
      </button>
      <output aria-label="presses">{presses}</output>
      <output aria-label="holds">{holds}</output>
    </>
  );
}

const secondPointer = {
  button: 0,
  clientX: 12,
  clientY: 12,
  isPrimary: true,
  pointerId: 4,
  pointerType: "mouse",
};

describe("useSecondPressHold", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the first desktop press immediate and turns a held second press into the alternate action", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<GestureHarness />);
    const toggle = screen.getByRole("button", { name: "Toggle" });

    fireEvent.click(toggle, { detail: 1 });
    expect(screen.getByLabelText("presses")).toHaveTextContent("1");

    now = 100;
    fireEvent.pointerDown(toggle, secondPointer);
    expect(toggle).toHaveAttribute("data-second-press-holding", "true");
    act(() => vi.advanceTimersByTime(480));
    expect(screen.getByLabelText("holds")).toHaveTextContent("1");

    fireEvent.pointerUp(toggle, secondPointer);
    fireEvent.click(toggle, { detail: 2 });
    expect(screen.getByLabelText("presses")).toHaveTextContent("1");
  });

  it("defers the first compact-layout press during the second-press window", () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<GestureHarness deferFirstPress />);
    const toggle = screen.getByRole("button", { name: "Toggle" });

    fireEvent.click(toggle, { detail: 1 });
    act(() => vi.advanceTimersByTime(1199));
    expect(screen.getByLabelText("presses")).toHaveTextContent("0");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByLabelText("presses")).toHaveTextContent("1");
  });

  it("treats a quick second compact-layout press as the normal action", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<GestureHarness deferFirstPress />);
    const toggle = screen.getByRole("button", { name: "Toggle" });

    fireEvent.click(toggle, { detail: 1 });
    now = 120;
    fireEvent.pointerDown(toggle, secondPointer);
    fireEvent.pointerUp(toggle, secondPointer);
    fireEvent.click(toggle, { detail: 2 });

    expect(screen.getByLabelText("presses")).toHaveTextContent("1");
    expect(screen.getByLabelText("holds")).toHaveTextContent("0");
  });

  it("keeps keyboard activation immediate", () => {
    vi.useFakeTimers();
    render(<GestureHarness deferFirstPress />);
    const toggle = screen.getByRole("button", { name: "Toggle" });

    fireEvent.click(toggle, { detail: 0 });
    expect(screen.getByLabelText("presses")).toHaveTextContent("1");
  });
});
