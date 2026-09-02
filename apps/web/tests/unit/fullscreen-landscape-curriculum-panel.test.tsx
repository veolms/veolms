import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
  FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT,
  FullscreenLandscapeCurriculumPanel,
} from "../../src/learning/FullscreenLandscapeCurriculumPanel.js";

describe("FullscreenLandscapeCurriculumPanel", () => {
  it("resizes the video between a 50/50 and 80/20 split", () => {
    const onVideoWidthPercentChange = vi.fn();
    const { container } = render(
      <div className="video-shell">
        <FullscreenLandscapeCurriculumPanel
          videoWidthPercent={60}
          onVideoWidthPercentChange={onVideoWidthPercentChange}
        >
          <div>Curriculum</div>
        </FullscreenLandscapeCurriculumPanel>
      </div>,
    );
    const shell = container.querySelector<HTMLElement>(".video-shell")!;
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

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 700,
      pointerId: 4,
      pointerType: "touch",
    });
    fireEvent.pointerMove(separator, {
      clientX: 950,
      pointerId: 4,
      pointerType: "touch",
    });
    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(
      FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
    );

    fireEvent.pointerMove(separator, {
      clientX: 450,
      pointerId: 4,
      pointerType: "touch",
    });
    expect(onVideoWidthPercentChange).toHaveBeenLastCalledWith(
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
  });
});
