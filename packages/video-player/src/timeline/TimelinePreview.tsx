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
        setSheetSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
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

export type TimelinePreviewLayout = "follow" | "follow-pill" | "centered-pill";

interface TimelinePreviewProps {
  duration: number;
  previewTime: number;
  /**
   * `follow` (the default) is a card that travels with the pointer;
   * `centered-pill` is a single line fixed over the middle of the timeline;
   * `follow-pill` is that same line, travelling with the pointer.
   */
  layout?: TimelinePreviewLayout;
}

/**
 * A chapter still that removes itself when the image cannot be loaded, so a
 * missing frame degrades to the text-only preview instead of a broken image.
 */
function ChapterThumbnail({ src }: { src: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      data-video-player-preview-thumbnail=""
      className="aspect-video w-24 shrink-0 rounded-lg bg-black object-cover"
      onError={() => setFailedSrc(src)}
    />
  );
}

export function TimelinePreview({
  duration,
  layout = "follow",
  previewTime,
}: TimelinePreviewProps) {
  const controllerData = useTimelinePreviewData(previewTime);
  if (layout === "centered-pill" || layout === "follow-pill") {
    // One line: the time, then the chapter it falls in. The pill grows with
    // the chapter's name; only a name too long for the player is cut short.
    // Centred, it stays over the middle of the timeline wherever the thumb
    // is. Following, it travels with the pointer, and leans inward near
    // either end so it does not run off the player.
    const pillPosition = timeToPositionPercent(previewTime, duration);
    const pillTranslate =
      pillPosition < 14 ? 0 : pillPosition > 86 ? -100 : -50;
    return (
      <div
        style={
          layout === "follow-pill"
            ? {
                left: `${pillPosition}%`,
                transform: `translateX(${pillTranslate}%)`,
              }
            : undefined
        }
        className={`pointer-events-none absolute bottom-full z-30 mb-2.5 flex h-9.5 w-max max-w-[calc(100%-1.5rem)] items-center ${layout === "centered-pill" ? "left-1/2 -translate-x-1/2" : ""} gap-2.5 rounded-full bg-(--video-player-control-surface,rgb(5_7_11/0.5)) px-3.5 text-sm font-semibold text-(--video-player-control-text,#fff) shadow-(--video-player-control-shadow) `}
        data-video-player-preview=""
        data-video-player-preview-mode="pill"
      >
        <span className="shrink-0 tabular-nums">
          {formatMediaTime(previewTime)}
        </span>
        {controllerData.chapterTitle ? (
          <span className="min-w-0 truncate font-medium opacity-85">
            {controllerData.chapterTitle}
          </span>
        ) : null}
      </div>
    );
  }
  const position = timeToPositionPercent(previewTime, duration);
  const translate = position < 14 ? 0 : position > 86 ? -100 : -50;
  const hasRichPreview = Boolean(
    controllerData.frame || controllerData.chapterTitle,
  );
  // A storyboard frame is the exact hovered moment and wins over the
  // chapter still, which only shows where the chapter begins.
  const chapterThumbnailUrl = controllerData.frame
    ? null
    : controllerData.chapterThumbnailUrl;

  return (
    <div
      className={`pointer-events-none absolute bottom-full z-30 mb-2.5 overflow-hidden text-white shadow-[0_8px_24px_rgba(0,0,0,0.32)] ${
        hasRichPreview
          ? `${chapterThumbnailUrl ? "w-max max-w-[min(19rem,80vw)]" : "w-44 max-w-[min(11rem,70vw)]"} rounded-xl border border-white/15 bg-[color-mix(in_srgb,#05070b_82%,var(--video-player-accent,#ff7a1a)_4%)]`
          : "w-max max-w-[calc(100vw-1rem)] rounded-full bg-[color-mix(in_srgb,#05070b_64%,var(--video-player-accent,#ff7a1a)_4%)]"
      }`}
      style={
        {
          left: `${position}%`,
          transform: `translateX(${translate}%)`,
          "--video-player-preview-position": `${position}%`,
        } as CSSProperties
      }
      data-video-player-preview=""
      data-video-player-preview-mode={hasRichPreview ? "rich" : "time"}
    >
      {controllerData.frame ? (
        <div className="overflow-hidden bg-black">
          <StoryboardImage frame={controllerData.frame} />
        </div>
      ) : null}
      {chapterThumbnailUrl ? (
        <div className="flex items-center gap-3 p-1.5 pr-3.5">
          <ChapterThumbnail src={chapterThumbnailUrl} />
          <div className="min-w-0 space-y-0.5 py-0.5 pl-1.5">
            <p className="line-clamp-2 text-xs font-medium leading-4 text-white/80">
              {controllerData.chapterTitle}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {formatMediaTime(previewTime)}
            </p>
          </div>
        </div>
      ) : (
        <div
          className={
            hasRichPreview
              ? "space-y-0.5 px-3 py-2 text-center"
              : "px-2.5 py-1.5 text-center"
          }
        >
          {controllerData.chapterTitle ? (
            <p className="truncate text-xs font-medium text-white/75">
              {controllerData.chapterTitle}
            </p>
          ) : null}
          <p
            className={`${hasRichPreview ? "text-sm" : "text-xs"} font-semibold tabular-nums`}
          >
            {formatMediaTime(previewTime)}
          </p>
        </div>
      )}
    </div>
  );
}

function useTimelinePreviewData(previewTime: number) {
  return usePlayerState(
    ({ storyboard, chapters }) => {
      const chapter = getActiveChapter(chapters, previewTime);
      return {
        frame: getThumbnailAtTime(storyboard, previewTime),
        chapterTitle: chapter?.title ?? null,
        chapterThumbnailUrl: chapter?.thumbnailUrl ?? null,
      };
    },
    (left, right) =>
      left.frame?.id === right.frame?.id &&
      left.chapterTitle === right.chapterTitle &&
      left.chapterThumbnailUrl === right.chapterThumbnailUrl,
  );
}
