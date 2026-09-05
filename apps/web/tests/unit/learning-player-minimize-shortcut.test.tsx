import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLearningPlayerMinimizeShortcut } from "../../src/learning/player/useLearningPlayerMinimizeShortcut.js";

describe("useLearningPlayerMinimizeShortcut", () => {
  it("restores with I and closes with Escape", () => {
    const onTrigger = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useLearningPlayerMinimizeShortcut({
        enabled: true,
        onTrigger,
        onClose,
      }),
    );

    fireEvent.keyDown(window, { code: "KeyI", key: "i" });
    expect(onTrigger).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { code: "Escape", key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes with Escape even when focus is outside the mini player", () => {
    const onTrigger = vi.fn();
    const onClose = vi.fn();
    const field = document.createElement("button");
    document.body.append(field);

    renderHook(() =>
      useLearningPlayerMinimizeShortcut({
        enabled: true,
        onTrigger,
        onClose,
      }),
    );

    fireEvent.keyDown(field, { code: "Escape", key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    field.remove();
  });
});
