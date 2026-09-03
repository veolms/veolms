import {
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { formatMediaTime } from "../accessibility/formatMediaTime";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import {
  clamp,
  normalizeBufferedRanges,
  pointerPositionToTime,
  positionTimelineMarkers,
  timeToPositionPercent,
} from "./timelineMath";
import { TimelinePreview } from "./TimelinePreview";

const KEYBOARD_SEEK_SECONDS = 5;

export interface TimelineProps {
  className?: string;
  ariaLabel?: string;
  showPreview?: boolean;
}

export function Timeline({
  ariaLabel = "Video timeline",
  className = "",
  showPreview = true,
}: TimelineProps) {
  const controller = usePlayerController();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const {
    buffered,
    chapters,
    controlsVisible,
    currentTime,
    duration,
    markers,
    previewTime,
    scrubbing,
  } = usePlayerState(
    (snapshot) => ({
      buffered: snapshot.media.buffered,
      chapters: snapshot.chapters,
      controlsVisible: snapshot.ui.controlsVisible,
      currentTime: snapshot.media.currentTime,
      duration: snapshot.media.duration,
      markers: snapshot.markers,
      previewTime: snapshot.ui.previewTime,
      scrubbing: snapshot.ui.scrubbing,
    }),
    (left, right) =>
      left.buffered === right.buffered &&
      left.chapters === right.chapters &&
      left.controlsVisible === right.controlsVisible &&
      left.currentTime === right.currentTime &&
      left.duration === right.duration &&
      left.markers === right.markers &&
      left.previewTime === right.previewTime &&
      left.scrubbing === right.scrubbing,
  );

  const previewAtPointer = useCallback(
    (clientX: number) => {
      const bounds = trackRef.current?.getBoundingClientRect();
      if (!bounds) return 0;
      const time = pointerPositionToTime(clientX, bounds, duration);
      controller.setPreviewTime(time);
      return time;
    },
    [controller, duration],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    controller.setScrubbing(true);
    controller.setControlsVisible(true);
    controller.seekTo(previewAtPointer(event.clientX));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && pointerIdRef.current === null) return;
    const time = previewAtPointer(event.clientX);
    if (pointerIdRef.current === event.pointerId) controller.seekTo(time);
  };

  const finishPointerInteraction = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    controller.seekTo(previewAtPointer(event.clientX));
    pointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    controller.setScrubbing(false);
    if (event.pointerType !== "mouse") controller.setPreviewTime(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    let nextTime: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextTime = currentTime - KEYBOARD_SEEK_SECONDS;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextTime = currentTime + KEYBOARD_SEEK_SECONDS;
        break;
      case "PageDown":
        nextTime = currentTime - duration * 0.1;
        break;
      case "PageUp":
        nextTime = currentTime + duration * 0.1;
        break;
      case "Home":
        nextTime = 0;
        break;
      case "End":
        nextTime = duration;
        break;
      default:
        return;
    }
    event.preventDefault();
    controller.seekTo(clamp(nextTime, 0, duration));
  };

  const progress = timeToPositionPercent(currentTime, duration);
  const bufferedRanges = normalizeBufferedRanges(buffered, duration);
  const positionedMarkers = positionTimelineMarkers(markers, duration);
  const chapterDivisions = chapters.slice(1);
  const timelineAvailable = Number.isFinite(duration) && duration > 0;

  return (
    <div
      className={`group/timeline relative w-full touch-none ${className}`}
      data-controls-visible={controlsVisible ? "true" : "false"}
      data-scrubbing={scrubbing ? "true" : "false"}
    >
      {showPreview && previewTime !== null ? (
        <TimelinePreview duration={duration} previewTime={previewTime} />
      ) : null}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={timelineAvailable ? 0 : -1}
        aria-disabled={!timelineAvailable}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={Number.isFinite(duration) ? Math.round(duration) : 0}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatMediaTime(currentTime)} of ${formatMediaTime(duration)}`}
        data-player-control=""
        data-scrubbing={scrubbing ? "true" : "false"}
        className="relative flex h-6 cursor-pointer items-center focus-visible:outline-none focus-visible:after:absolute focus-visible:after:inset-x-0 focus-visible:after:top-1/2 focus-visible:after:h-3 focus-visible:after:-translate-y-1/2 focus-visible:after:rounded-full focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--video-player-accent,#ff7a1a)] aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={(event) => {
          if (pointerIdRef.current !== event.pointerId) return;
          pointerIdRef.current = null;
          controller.setScrubbing(false);
          controller.setPreviewTime(null);
        }}
        onPointerEnter={(event) => previewAtPointer(event.clientX)}
        onPointerLeave={() => {
          if (pointerIdRef.current === null) controller.setPreviewTime(null);
        }}
      >
        <div
          aria-hidden="true"
          data-timeline-visual=""
          className="pointer-events-none absolute inset-0"
        >
          <div
            data-timeline-track=""
            className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/30 transition-[height] duration-150 group-hover/timeline:h-1.5 group-focus-within/timeline:h-1.5 group-data-[scrubbing=true]/timeline:h-1.5"
          >
            {bufferedRanges.map((range) => (
              <span
                key={`${range.start}-${range.end}`}
                data-timeline-buffered-range=""
                className="absolute inset-y-0 rounded-full bg-white/45"
                style={{
                  left: `${timeToPositionPercent(range.start, duration)}%`,
                  width: `${timeToPositionPercent(range.end - range.start, duration)}%`,
                }}
              />
            ))}
            <span
              data-timeline-progress=""
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--video-player-accent,#ff7a1a)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {chapterDivisions.map((chapter) => (
            <span
              key={chapter.id}
              aria-hidden="true"
              className="absolute top-1/2 z-10 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950/90"
              style={{
                left: `${timeToPositionPercent(chapter.startTime, duration)}%`,
              }}
            />
          ))}

          <span
            aria-hidden="true"
            data-timeline-thumb=""
            className="absolute top-1/2 z-20 size-3 scale-100 rounded-full bg-[var(--video-player-accent,#ff7a1a)] opacity-0 shadow-[0_2px_6px_rgb(0_0_0_/_0.4)] transition-[scale,opacity] duration-200 ease-out group-data-[controls-visible=true]/timeline:opacity-100 group-hover/timeline:scale-[1.6] group-hover/timeline:opacity-100 group-focus-within/timeline:scale-[1.6] group-focus-within/timeline:opacity-100 group-data-[scrubbing=true]/timeline:scale-[1.6] group-data-[scrubbing=true]/timeline:opacity-100"
            style={{
              left: `${progress}%`,
              transformOrigin: `${progress}% 50%`,
              translate: `${-progress}% -50%`,
            }}
          />
        </div>
      </div>

      {positionedMarkers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          aria-label={
            marker.label ?? `${marker.type} at ${formatMediaTime(marker.time)}`
          }
          title={marker.label}
          className="absolute top-1/2 z-20 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50 bg-white shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ left: `${marker.positionPercent}%` }}
          data-marker-type={marker.type}
          onClick={() => controller.seekTo(marker.time)}
        />
      ))}
    </div>
  );
}
