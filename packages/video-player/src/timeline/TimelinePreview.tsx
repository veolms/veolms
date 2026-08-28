import { useEffect, useState, type CSSProperties } from "react";
import { formatMediaTime } from "../accessibility/formatMediaTime";
import { getActiveChapter } from "../chapters/getChapterAtTime";
import { usePlayerState } from "../react/usePlayerState";
import { getThumbnailAtTime } from "../storyboard/getThumbnailAtTime";
import type { StoryboardFrame } from "../storyboard/storyboardTypes";
import { timeToPositionPercent } from "./timelineMath";

function StoryboardImage({ frame }: { frame: StoryboardFrame }) {
  const isSprite =
    frame.x !== undefined &&
    frame.y !== undefined &&
    frame.width !== undefined &&
    frame.height !== undefined;

  if (!isSprite) {
    return (
      <img
        src={frame.imageUrl}
        alt=""
        className="aspect-video w-full bg-black object-cover"
        draggable={false}
      />
    );
  }

  return <SpriteFrame frame={frame} />;
}

function SpriteFrame({ frame }: { frame: StoryboardFrame }) {
  const [sheetSize, setSheetSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const width = frame.width ?? 1;
  const height = frame.height ?? 1;
  const x = frame.x ?? 0;
  const y = frame.y ?? 0;

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setSheetSize({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.src = frame.imageUrl;
    return () => {
      active = false;
      image.onload = null;
    };
  }, [frame.imageUrl]);

  const backgroundPositionX =
    sheetSize && sheetSize.width > width
      ? (x / (sheetSize.width - width)) * 100
      : 0;
  const backgroundPositionY =
    sheetSize && sheetSize.height > height
      ? (y / (sheetSize.height - height)) * 100
      : 0;

  return (
    <div
      aria-hidden="true"
      className="w-full bg-black bg-no-repeat transition-opacity duration-100"
      style={{
        aspectRatio: `${width} / ${height}`,
        backgroundImage: `url(${JSON.stringify(frame.imageUrl)})`,
        backgroundPosition: `${backgroundPositionX}% ${backgroundPositionY}%`,
        backgroundSize: sheetSize
          ? `${(sheetSize.width / width) * 100}% ${(sheetSize.height / height) * 100}%`
          : undefined,
        opacity: sheetSize ? 1 : 0,
      }}
    />
  );
}

export interface TimelinePreviewProps {
  duration: number;
  previewTime: number;
}

export function TimelinePreview({ duration, previewTime }: TimelinePreviewProps) {
  const controllerData = useTimelinePreviewData(previewTime);
  const position = timeToPositionPercent(previewTime, duration);
  const translate = position < 14 ? 0 : position > 86 ? -100 : -50;

  return (
    <div
      className="pointer-events-none absolute bottom-full z-30 mb-3 w-44 max-w-[min(11rem,70vw)] overflow-hidden rounded-xl border border-white/15 bg-neutral-950/95 text-white shadow-2xl backdrop-blur-xl"
      style={{
        left: `${position}%`,
        transform: `translateX(${translate}%)`,
        "--video-player-preview-position": `${position}%`,
      } as CSSProperties}
      data-video-player-preview=""
    >
      {controllerData.frame ? (
        <div className="overflow-hidden bg-black">
          <StoryboardImage frame={controllerData.frame} />
        </div>
      ) : null}
      <div className="space-y-0.5 px-3 py-2 text-center">
        {controllerData.chapterTitle ? (
          <p className="truncate text-xs font-medium text-white/75">
            {controllerData.chapterTitle}
          </p>
        ) : null}
        <p className="text-sm font-semibold tabular-nums">
          {formatMediaTime(previewTime)}
        </p>
      </div>
    </div>
  );
}

function useTimelinePreviewData(previewTime: number) {
  return usePlayerState(
    ({ storyboard, chapters }) => ({
      frame: getThumbnailAtTime(storyboard, previewTime),
      chapterTitle: getActiveChapter(chapters, previewTime)?.title ?? null,
    }),
    (left, right) =>
      left.frame?.id === right.frame?.id &&
      left.chapterTitle === right.chapterTitle,
  );
}
