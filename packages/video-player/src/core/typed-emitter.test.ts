import { describe, expect, it, vi } from "vitest";

import { TypedEventEmitter } from "./typed-emitter";

interface TestEvents {
  value: { value: number };
  empty: undefined;
}

describe("TypedEventEmitter", () => {
  it("supports typed subscriptions and unsubscribe", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn();
    const unsubscribe = emitter.on("value", listener);

    emitter.emit("value", { value: 1 });
    unsubscribe();
    emitter.emit("value", { value: 2 });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ value: 1 });
  });

  it("removes a once listener before invoking it", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn(() => emitter.emit("empty", undefined));

    emitter.once("empty", listener);
    emitter.emit("empty", undefined);
    emitter.emit("empty", undefined);

    expect(listener).toHaveBeenCalledOnce();
  });
});
