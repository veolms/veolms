import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  debounce,
  useDebounce,
  useDebouncedCallback,
  useDebounceValue,
} from "../../src/hooks/useDebounce";

describe("debounce (utility function)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays invoking function by 500ms by default", () => {
    const fn = vi.fn();
    const debounced = debounce(fn);

    debounced("test");
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("test");
  });

  it("supports custom delayMs", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced("hello");
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledWith("hello");
  });

  it("resets delay timer if invoked repeatedly within delay window", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);

    debounced("first");
    vi.advanceTimersByTime(300);
    debounced("second");
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("second");
  });

  it("supports cancel() to abort pending execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);

    debounced("cancel-me");
    expect(debounced.isPending()).toBe(true);

    debounced.cancel();
    expect(debounced.isPending()).toBe(false);

    vi.advanceTimersByTime(600);
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports flush() to immediately execute pending call", () => {
    const fn = vi.fn((val: string) => `result-${val}`);
    const debounced = debounce(fn, 500);

    debounced("flush-me");
    expect(debounced.isPending()).toBe(true);

    const res = debounced.flush();
    expect(res).toBe("result-flush-me");
    expect(fn).toHaveBeenCalledWith("flush-me");
    expect(debounced.isPending()).toBe(false);
  });

  it("supports leading: true to execute immediately on first invocation", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500, { leading: true, trailing: false });

    debounced("lead");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("lead");

    debounced("ignored");
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("supports maxWait to guarantee invocation after max threshold", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500, { maxWait: 1000 });

    // Call every 300ms so regular debounce would keep postponing
    debounced(1);
    vi.advanceTimersByTime(300);
    debounced(2);
    vi.advanceTimersByTime(300);
    debounced(3);
    vi.advanceTimersByTime(300);
    debounced(4);
    vi.advanceTimersByTime(100); // 1000ms elapsed total!

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("useDebouncedCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maintains stable function identity across re-renders", () => {
    const callback = vi.fn();
    const { result, rerender } = renderHook(() =>
      useDebouncedCallback(callback, 500),
    );

    const firstRef = result.current;
    rerender();
    const secondRef = result.current;

    expect(firstRef).toBe(secondRef);
  });

  it("cancels pending timer on unmount", () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback(callback, 500),
    );

    act(() => {
      result.current("test");
    });
    expect(result.current.isPending()).toBe(true);

    unmount();
    vi.advanceTimersByTime(600);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe("useDebounceValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces value changes by 500ms", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounceValue(val, 500),
      { initialProps: { val: "initial" } },
    );

    expect(result.current[0]).toBe("initial");

    rerender({ val: "changed" });
    expect(result.current[0]).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current[0]).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current[0]).toBe("changed");
  });

  it("immediately updates without debounce when value is cleared/empty string", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounceValue(val, 500),
      { initialProps: { val: "search query" } },
    );

    expect(result.current[0]).toBe("search query");

    // Clearing the query
    rerender({ val: "" });

    // Instantly cleared without waiting 500ms
    expect(result.current[0]).toBe("");
  });

  it("supports controls.setValueImmediately() and callable controls", () => {
    const { result } = renderHook(() => useDebounceValue("initial", 500));

    act(() => {
      result.current[1].setValueImmediately("forced-value");
    });

    expect(result.current[0]).toBe("forced-value");

    // Also supports direct callable invocation: controls("another-forced-value")
    act(() => {
      result.current[1]("another-forced-value");
    });

    expect(result.current[0]).toBe("another-forced-value");
  });
});

describe("useDebounce (convenience hook)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns debounced value with default 500ms delay", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounce(val),
      { initialProps: { val: "test" } },
    );

    expect(result.current).toBe("test");

    rerender({ val: "test-2" });
    expect(result.current).toBe("test");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe("test-2");
  });
});
