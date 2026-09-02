import { useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

export const FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT = 50;
export const FULLSCREEN_VIDEO_WIDTH_DEFAULT_PERCENT = 60;
export const FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT = 80;

interface FullscreenLandscapeCurriculumPanelProps {
  children: ReactNode;
  onVideoWidthPercentChange: (percent: number) => void;
  videoWidthPercent: number;
}

interface ResizeSession {
  handle: HTMLDivElement;
  pointerId: number;
  shellLeft: number;
  shellWidth: number;
}

const clampVideoWidthPercent = (percent: number) =>
  Math.min(
    FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
    Math.max(FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT, percent),
  );

export function FullscreenLandscapeCurriculumPanel({
  children,
  onVideoWidthPercentChange,
  videoWidthPercent,
}: FullscreenLandscapeCurriculumPanelProps) {
  const resizeSessionRef = useRef<ResizeSession | null>(null);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const shell = event.currentTarget.closest<HTMLElement>(".video-shell");
    const shellBounds = shell?.getBoundingClientRect();
    if (!shellBounds || shellBounds.width <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    resizeSessionRef.current = {
      handle: event.currentTarget,
      pointerId: event.pointerId,
      shellLeft: shellBounds.left,
      shellWidth: shellBounds.width,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    onVideoWidthPercentChange(
      clampVideoWidthPercent(
        ((event.clientX - session.shellLeft) / session.shellWidth) * 100,
      ),
    );
  };

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSessionRef.current = null;
    session.handle.releasePointerCapture?.(session.pointerId);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onVideoWidthPercentChange(
        clampVideoWidthPercent(
          videoWidthPercent + (event.key === "ArrowRight" ? 5 : -5),
        ),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      onVideoWidthPercentChange(FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT);
    } else if (event.key === "End") {
      event.preventDefault();
      onVideoWidthPercentChange(FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT);
    }
  };

  const contentWidthPercent = 100 - videoWidthPercent;

  return (
    <div
      className="relative z-20 h-full min-w-0 flex-1 overflow-hidden border-l border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_91%,var(--canvas))] text-(--text) shadow-[-18px_0_40px_rgba(0,0,0,0.2)] [&_.learning-curriculum]:h-full [&_.learning-curriculum]:rounded-none [&_.learning-curriculum]:bg-[color-mix(in_srgb,var(--surface)_91%,var(--canvas))] [&_.learning-curriculum]:shadow-none"
      data-learning-fullscreen-course-panel=""
      data-video-width-percent={Math.round(videoWidthPercent)}
    >
      <div
        className="group/resize absolute inset-y-0 left-0 z-50 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
        role="separator"
        aria-label="Resize fullscreen course content"
        aria-orientation="vertical"
        aria-valuemin={FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT}
        aria-valuemax={FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT}
        aria-valuenow={Math.round(videoWidthPercent)}
        aria-valuetext={`${Math.round(videoWidthPercent)} percent video, ${Math.round(contentWidthPercent)} percent course content`}
        data-learning-swipe-ignore=""
        data-fullscreen-course-resize=""
        tabIndex={0}
        onKeyDown={handleResizeKeyDown}
        onPointerCancel={finishResize}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={finishResize}
      >
        <span
          aria-hidden="true"
          className="h-[calc(100%-28px)] w-0.5 rounded-full bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--accent)_64%,var(--border))_16%,color-mix(in_srgb,var(--accent)_64%,var(--border))_84%,transparent)] opacity-80 shadow-[0_0_0_transparent] transition-[width,opacity,box-shadow] duration-160 group-hover/resize:w-0.75 group-hover/resize:opacity-100 group-hover/resize:shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_42%,transparent)] group-focus-visible/resize:w-0.75 group-focus-visible/resize:opacity-100"
        />
      </div>
      <div className="h-full min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
