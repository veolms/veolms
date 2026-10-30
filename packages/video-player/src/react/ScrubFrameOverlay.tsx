import { useId } from "react";
import { getThumbnailAtTime } from "../storyboard/getThumbnailAtTime";
import { isKeptSpriteSheet } from "../storyboard/spriteSheetStore";
import { SpriteFrameCanvas } from "./SpriteFrameCanvas";
import { usePlayerState } from "./usePlayerState";

/**
 * While a drag is over a part of the video not downloaded yet, the
 * storyboard frame for that moment is drawn over the whole video, scaled up
 * (and so soft), the way YouTube does. Sheets the player keeps itself are
 * drawn on a canvas that holds its last picture between frames, so it
 * never shows a blank; with no frame for the moment the video keeps its
 * last picture.
 */
export function ScrubFrameOverlay() {
  const clipId = useId();
  const frame = usePlayerState(
    ({ storyboard, ui }) =>
      ui.scrubFrameTime === null
        ? null
        : getThumbnailAtTime(storyboard, ui.scrubFrameTime),
    (left, right) => left?.id === right?.id,
  );

  if (frame && isKeptSpriteSheet(frame.imageUrl)) {
    return (
      <SpriteFrameCanvas
        frame={frame}
        data-video-player-scrub-frame=""
        className="pointer-events-none absolute inset-0 z-[1] size-full bg-black object-contain"
      />
    );
  }

  if (
    !frame ||
    frame.x === undefined ||
    frame.y === undefined ||
    frame.width === undefined ||
    frame.height === undefined ||
    frame.sheetWidth === undefined ||
    frame.sheetHeight === undefined
  ) {
    return null;
  }

  // The view box frames one cell of the sheet and `meet` fits it the way
  // the video itself is fitted; the clip keeps the neighbouring cells out of
  // the bars a wider or taller player leaves.
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] size-full bg-black"
      data-video-player-scrub-frame=""
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <clipPath id={clipId}>
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
        />
      </clipPath>
      <image
        clipPath={`url(#${CSS.escape(clipId)})`}
        href={frame.imageUrl}
        x={0}
        y={0}
        width={frame.sheetWidth}
        height={frame.sheetHeight}
        preserveAspectRatio="none"
      />
    </svg>
  );
}
