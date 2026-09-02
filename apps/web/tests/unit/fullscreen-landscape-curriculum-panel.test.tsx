import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
  FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT,
  FullscreenLandscapeCurriculumPanel,
} from "../../src/learning/FullscreenLandscapeCurriculumPanel.js";

describe("FullscreenLandscapeCurriculumPanel", () => {
  it("resizes the video between a 50/50 and 80/20 split", () => {
    const onClose = vi.fn();
    const onVideoWidthPercentChange = vi.fn();
    const onVideoWidthPreviewChange = vi.fn();
    const { container } = render(
      <div className="video-shell">
        <FullscreenLandscapeCurriculumPanel
          onClose={onClose}
          videoWidthPercent={60}
          onVideoWidthPercentChange={onVideoWidthPercentChange}
          onVideoWidthPreviewChange={onVideoWidthPreviewChange}
        >
          <div>Curriculum</div>
        </FullscreenLandscapeCurriculumPanel>
      </div>,
    );
    const shell = container.querySelector<HTMLElement>(".video-shell")!;
    const panel = container.querySelector<HTMLElement>(
      "[data-learning-fullscreen-course-panel]",
    );
    expect(panel).toHaveAttribute("data-player-fullscreen-swipe-ignore");
    expect(panel).toHaveAttribute("data-learning-swipe-ignore");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 400,
      left: 100,
      right: 1100,
      top: 0,
      width: 1000,
      x: 100,
      y: 0,
      toJSON: () => undefined,
    });
    const separator = screen.getByRole("separator", {
      name: "Resize fullscreen course content",
    });
    const gestureClaim = vi.fn();
    window.addEventListener("veolms:pointer-gesture-claim", gestureClaim, {
      once: true,
    });
    expect(separator).toHaveClass("w-16", "touch-none");
    expect(panel).toHaveStyle({
      transform:
        "translate3d(var(--learning-fullscreen-panel-offset-x, 0px), 0, 0)",
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 700,
      pointerId: 4,
      pointerType: "touch",
    });
    expect(
      (gestureClaim.mock.calls[0]?.[0] as CustomEvent | undefined)?.detail,
    ).toEqual({ owner: "learning-space", pointerId: 4 });
    fireEvent.pointerMove(separator, {
      clientX: 950,
      pointerId: 4,
      pointerType: "touch",
    });
    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(
      FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
    );
    expect(onVideoWidthPreviewChange).toHaveBeenLastCalledWith(85);

    fireEvent.pointerMove(separator, {
      clientX: 450,
      pointerId: 4,
      pointerType: "touch",
    });
    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(
      FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT,
    );
    expect(onVideoWidthPreviewChange).toHaveBeenLastCalledWith(
      FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT,
    );

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(65);
    fireEvent.keyDown(separator, { key: "Home" });
    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(
      FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT,
    );
    fireEvent.keyDown(separator, { key: "End" });
    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(
      FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes from a rightward panel drag after half its width", () => {
    const onClose = vi.fn();
    const onVideoWidthPreviewChange = vi.fn();
    const { container } = render(
      <div className="video-shell">
        <FullscreenLandscapeCurriculumPanel
          onClose={onClose}
          videoWidthPercent={60}
          onVideoWidthPercentChange={vi.fn()}
          onVideoWidthPreviewChange={onVideoWidthPreviewChange}
        >
          <button type="button">Lesson one</button>
        </FullscreenLandscapeCurriculumPanel>
      </div>,
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-learning-fullscreen-course-panel]",
    )!;
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 400,
      left: 700,
      right: 1_000,
      top: 0,
      width: 300,
      x: 700,
      y: 0,
      toJSON: () => undefined,
    });

    fireEvent.pointerDown(panel, {
      button: 0,
      clientX: 720,
      clientY: 120,
      pointerId: 11,
      pointerType: "touch",
    });
    fireEvent.pointerMove(panel, {
      clientX: 890,
      clientY: 124,
      pointerId: 11,
      pointerType: "touch",
    });
    expect(panel).toHaveAttribute(
      "data-fullscreen-course-panel-motion",
      "dragging",
    );
    expect(onVideoWidthPreviewChange).toHaveBeenLastCalledWith(
      82.66666666666666,
    );

    fireEvent.pointerUp(panel, {
      clientX: 890,
      clientY: 124,
      pointerId: 11,
      pointerType: "touch",
    });
    expect(panel).toHaveAttribute(
      "data-fullscreen-course-panel-motion",
      "dismissing",
    );
    expect(onVideoWidthPreviewChange).toHaveBeenLastCalledWith(100);
    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("captures a section-row flick without activating the lesson underneath", () => {
    const onClose = vi.fn();
    const onLessonSelect = vi.fn();
    const { container } = render(
      <div className="video-shell">
        <FullscreenLandscapeCurriculumPanel
          onClose={onClose}
          videoWidthPercent={60}
          onVideoWidthPercentChange={vi.fn()}
          onVideoWidthPreviewChange={vi.fn()}
        >
          <button
            type="button"
            onClick={onLessonSelect}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            Lesson one
          </button>
        </FullscreenLandscapeCurriculumPanel>
      </div>,
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-learning-fullscreen-course-panel]",
    )!;
    const lesson = screen.getByRole("button", { name: "Lesson one" });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 400,
      left: 700,
      right: 1_000,
      top: 0,
      width: 300,
      x: 700,
      y: 0,
      toJSON: () => undefined,
    });

    fireEvent.pointerDown(lesson, {
      button: 0,
      clientX: 720,
      clientY: 120,
      pointerId: 14,
      pointerType: "touch",
    });
    fireEvent.pointerMove(lesson, {
      clientX: 750,
      clientY: 121,
      pointerId: 14,
      pointerType: "touch",
    });
    fireEvent.pointerUp(lesson, {
      clientX: 750,
      clientY: 121,
      pointerId: 14,
      pointerType: "touch",
    });
    fireEvent.click(lesson);

    expect(panel).toHaveAttribute(
      "data-fullscreen-course-panel-motion",
      "dismissing",
    );
    expect(onLessonSelect).not.toHaveBeenCalled();
    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leaves the elastic scroller gesture surface untouched", () => {
    const onClose = vi.fn();
    const onVideoWidthPreviewChange = vi.fn();
    const { container } = render(
      <div className="video-shell">
        <FullscreenLandscapeCurriculumPanel
          onClose={onClose}
          videoWidthPercent={60}
          onVideoWidthPercentChange={vi.fn()}
          onVideoWidthPreviewChange={onVideoWidthPreviewChange}
        >
          <button type="button" className="elastic-scroller">
            Elastic scroll control
          </button>
        </FullscreenLandscapeCurriculumPanel>
      </div>,
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-learning-fullscreen-course-panel]",
    )!;
    const elasticScroller = screen.getByRole("button", {
      name: "Elastic scroll control",
    });

    fireEvent.pointerDown(elasticScroller, {
      clientX: 720,
      clientY: 120,
      pointerId: 17,
      pointerType: "touch",
    });
    fireEvent.pointerMove(elasticScroller, {
      clientX: 920,
      clientY: 122,
      pointerId: 17,
      pointerType: "touch",
    });
    fireEvent.pointerUp(elasticScroller, {
      clientX: 920,
      clientY: 122,
      pointerId: 17,
      pointerType: "touch",
    });

    expect(panel).toHaveAttribute(
      "data-fullscreen-course-panel-motion",
      "idle",
    );
    expect(panel).toHaveStyle({
      transform:
        "translate3d(var(--learning-fullscreen-panel-offset-x, 0px), 0, 0)",
    });
    expect(onVideoWidthPreviewChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps vertical curriculum scrolling separate from panel dismissal", () => {
    const onClose = vi.fn();
    const { container } = render(
      <div className="video-shell">
        <FullscreenLandscapeCurriculumPanel
          onClose={onClose}
          videoWidthPercent={60}
          onVideoWidthPercentChange={vi.fn()}
          onVideoWidthPreviewChange={vi.fn()}
        >
          <div>Curriculum</div>
        </FullscreenLandscapeCurriculumPanel>
      </div>,
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-learning-fullscreen-course-panel]",
    )!;
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 400,
      left: 700,
      right: 1_000,
      top: 0,
      width: 300,
      x: 700,
      y: 0,
      toJSON: () => undefined,
    });

    fireEvent.pointerDown(panel, {
      clientX: 760,
      clientY: 80,
      pointerId: 12,
      pointerType: "touch",
    });
    fireEvent.pointerMove(panel, {
      clientX: 770,
      clientY: 220,
      pointerId: 12,
      pointerType: "touch",
    });
    fireEvent.pointerUp(panel, {
      clientX: 770,
      clientY: 220,
      pointerId: 12,
      pointerType: "touch",
    });

    expect(panel).toHaveAttribute(
      "data-fullscreen-course-panel-motion",
      "idle",
    );
    expect(panel).toHaveStyle({
      transform:
        "translate3d(var(--learning-fullscreen-panel-offset-x, 0px), 0, 0)",
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("slides out from the mobile minimum when divider resizing continues right", () => {
    const onClose = vi.fn();
    const onVideoWidthPercentChange = vi.fn();
    const onVideoWidthPreviewChange = vi.fn();
    const { container } = render(
      <div className="video-shell">
        <FullscreenLandscapeCurriculumPanel
          onClose={onClose}
          videoWidthPercent={60}
          onVideoWidthPercentChange={onVideoWidthPercentChange}
          onVideoWidthPreviewChange={onVideoWidthPreviewChange}
        >
          <div>Curriculum</div>
        </FullscreenLandscapeCurriculumPanel>
      </div>,
    );
    const shell = container.querySelector<HTMLElement>(".video-shell")!;
    const panel = container.querySelector<HTMLElement>(
      "[data-learning-fullscreen-course-panel]",
    )!;
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 400,
      left: 100,
      right: 1_100,
      top: 0,
      width: 1_000,
      x: 100,
      y: 0,
      toJSON: () => undefined,
    });
    const separator = screen.getByRole("separator", {
      name: "Resize fullscreen course content",
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 700,
      pointerId: 13,
      pointerType: "touch",
    });
    fireEvent.pointerMove(separator, {
      clientX: 1_000,
      pointerId: 13,
      pointerType: "touch",
    });

    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(
      FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
    );
    expect(onVideoWidthPreviewChange).toHaveBeenLastCalledWith(90);
    fireEvent.pointerUp(separator, {
      clientX: 1_000,
      pointerId: 13,
      pointerType: "touch",
    });
    expect(onVideoWidthPreviewChange).toHaveBeenLastCalledWith(100);
    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
