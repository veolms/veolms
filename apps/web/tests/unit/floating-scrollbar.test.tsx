import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
  FloatingScrollbar,
} from "../../src/shell/FloatingScrollbar";
import type { FloatingScrollbarHorizontalDragDetail } from "../../src/shell/FloatingScrollbar";

function HorizontalDragHarness() {
  const scrollportRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div id="test-scrollport" ref={scrollportRef} />
      <FloatingScrollbar
        ariaControls="test-scrollport"
        enableHorizontalDrag
        scrollportRef={scrollportRef}
      />
    </>
  );
}

describe("FloatingScrollbar", () => {
  it("cancels an interrupted horizontal resize instead of committing it", () => {
    render(<HorizontalDragHarness />);

    const scrollbar = document.querySelector<HTMLElement>(
      ".floating-scrollbar",
    );
    const thumb = scrollbar?.querySelector<HTMLElement>(
      ".floating-scrollbar__thumb",
    );
    expect(scrollbar).not.toBeNull();
    expect(thumb).not.toBeNull();

    scrollbar!.classList.add("is-visible");
    scrollbar!.getBoundingClientRect = () =>
      ({
        bottom: 200,
        height: 200,
        left: 96,
        right: 104,
        top: 0,
        width: 8,
        x: 96,
        y: 0,
        toJSON: vi.fn(),
      }) as DOMRect;
    thumb!.getBoundingClientRect = () =>
      ({
        bottom: 40,
        height: 40,
        left: 96,
        right: 104,
        top: 0,
        width: 8,
        x: 96,
        y: 0,
        toJSON: vi.fn(),
      }) as DOMRect;
    scrollbar!.setPointerCapture = vi.fn();
    scrollbar!.hasPointerCapture = vi.fn(() => true);
    scrollbar!.releasePointerCapture = vi.fn();

    const phases: FloatingScrollbarHorizontalDragDetail["phase"][] = [];
    const recordPhase = (event: Event) => {
      phases.push(
        (event as CustomEvent<FloatingScrollbarHorizontalDragDetail>).detail
          .phase,
      );
    };
    window.addEventListener(
      FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
      recordPhase,
    );

    fireEvent.pointerDown(scrollbar!, {
      button: 0,
      clientX: 100,
      clientY: 20,
      pointerId: 7,
    });
    fireEvent.pointerMove(scrollbar!, {
      clientX: 140,
      clientY: 20,
      pointerId: 7,
    });
    fireEvent.pointerCancel(scrollbar!, {
      clientX: 140,
      clientY: 20,
      pointerId: 7,
    });

    window.removeEventListener(
      FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
      recordPhase,
    );
    expect(phases).toEqual(["start", "move", "cancel"]);
    expect(scrollbar).not.toHaveClass("is-dragging", "is-resizing");
  });
});
