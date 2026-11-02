import { useEffect, useState, type CSSProperties } from "react";
import { formatMediaTime } from "../accessibility/formatMediaTime";
import { getActiveChapter } from "../chapters/getChapterAtTime";
import { usePlayerState } from "../react/usePlayerState";
import { SpriteFrameCanvas } from "../react/SpriteFrameCanvas";
import { getThumbnailAtTime } from "../storyboard/getThumbnailAtTime";
import { isKeptSpriteSheet } from "../storyboard/spriteSheetStore";
import type { StoryboardFrame } from "../storyboard/storyboardTypes";
import { timeToPositionPercent } from "./timelineMath";

function StoryboardImage({
  frame,
  onDrawn,
}: {
  frame: StoryboardFrame;
  onDrawn?: () => void;
}) {
  if (isKeptSpriteSheet(frame.imageUrl)) {
    return (
      <SpriteFrameCanvas
        frame={frame}
        onDrawn={onDrawn}
        className="block w-full bg-black"
      />
    );
  }
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
  const [loadedSheetSize, setSheetSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  // A sheet whose size the storyboard states is drawn at once, without
  // waiting for it to load again.
  const sheetSizeKnown =
    frame.sheetWidth !== undefined && frame.sheetHeight !== undefined;
  const knownSheetSize = sheetSizeKnown
    ? { width: frame.sheetWidth!, height: frame.sheetHeight! }
    : null;
  const sheetSize = knownSheetSize ?? loadedSheetSize;
  const width = frame.width ?? 1;
  const height = frame.height ?? 1;
  const x = frame.x ?? 0;
  const y = frame.y ?? 0;

  useEffect(() => {
    if (sheetSizeKnown) return undefined;
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
  }, [frame.imageUrl, sheetSizeKnown]);

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

/** The preview card's width (and so where its time pill sits). */
const PREVIEW_CARD_WIDTH_CLASS =
  "[--preview-card-width:clamp(15rem,36%,24rem)]";

/**
 * The card follows the pointer but stops at either end of the timeline
 * instead of running off the player.
 */
function previewCardLeft(position: number): string {
  return `clamp(min(50%, calc(var(--preview-card-width) / 2)), ${position}%, max(50%, calc(100% - var(--preview-card-width) / 2)))`;
}

/**
 * The time pill: see-through, fully rounded, a lighter grey than the
 * frame's shadow with a lighter shadow of its own, so it does not run into
 * the dark shadow under the frame it sits on. Its grey takes the hue of
 * the theme's accent colour, faintly, at the grey's own darkness (what
 * shows through it is blurred to black and white).
 */
const PREVIEW_TIME_PILL_CLASS =
  "rounded-full bg-[rgb(48_48_48/0.8)] supports-[color:oklch(from_red_l_c_h)]:bg-[oklch(from_var(--video-player-accent,#ff7a1a)_0.31_calc(c*0.4)_h/0.8)] px-3.5 py-1 text-sm leading-5 tabular-nums text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.26),0_1px_3px_rgb(0_0_0/0.22),0_4px_10px_rgb(0_0_0/0.16)] backdrop-blur-md backdrop-grayscale";

/** The timeline thumb's size (`size-3`), which stays inside the track. */
const TIMELINE_THUMB_SIZE_PX = 12;
/**
 * How far past either end of the timeline the drag's time pill may reach
 * before it stops following the thumb (the timeline sits about 12px in from
 * the player's edges).
 */
const SCRUB_PILL_OVERHANG_PX = 6;

/**
 * While the timeline is dragged: the hover card's time pill alone, at the
 * same height (astride where the card's bottom edge would be), the picture
 * being shown over the whole video instead. It stays centred over the
 * thumb right to either end, only stopping where it would run off the
 * player. Over a video with chapters, the name of the chapter at that
 * moment stands above it, in the middle of the player.
 */
function ScrubTimePill({
  chapterTitle,
  position,
  previewTime,
  touch,
}: {
  chapterTitle: string | null;
  position: number;
  previewTime: number;
  /**
   * A finger drag: the pill rises clear of the fingertip on the thumb, a
   * little above it (higher, it read as apart from the thumb).
   */
  touch: boolean;
}) {
  // The thumb's centre, as the thumb itself is placed (see `Timeline`).
  const thumbX = `(${position / 100} * (100cqw - ${TIMELINE_THUMB_SIZE_PX}px) + ${TIMELINE_THUMB_SIZE_PX / 2}px)`;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-full z-30 h-0 @container ${touch ? "mb-8" : "mb-5"}`}
      data-video-player-preview=""
      data-video-player-preview-mode="time"
    >
      <span
        className={`absolute bottom-0 ${PREVIEW_TIME_PILL_CLASS}`}
        style={{
          left: `calc${thumbX}`,
          translate: `clamp(calc(-1 * ${thumbX} - ${SCRUB_PILL_OVERHANG_PX}px), -50%, calc(100cqw + ${SCRUB_PILL_OVERHANG_PX}px - ${thumbX} - 100%)) 50%`,
        }}
      >
        {formatMediaTime(previewTime)}
      </span>
      {chapterTitle ? (
        <p
          data-video-player-preview-chapter=""
          className="absolute bottom-7 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 truncate text-center text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"
        >
          {chapterTitle}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The storyboard frame of the hovered moment, with the time in a chip
 * astride the middle of its bottom edge, half over the frame and half
 * below it, in the size of the player's own time display (and the chapter,
 * when there is one, above the frame). Shown for a hovering pointer only
 * (a mouse, on a phone too; a drag shows the moment over the whole video
 * instead). About 36% of the player wide, 15rem to 24rem, following the
 * pointer but stopping at either end of the timeline instead of running
 * off the player. A frame drawn on a canvas keeps the card hidden until
 * its first picture is in, so it never opens on a black box.
 */
function FramePreviewCard({
  chapterTitle,
  frame,
  position,
  previewTime,
}: {
  chapterTitle: string | null;
  frame: StoryboardFrame;
  position: number;
  previewTime: number;
}) {
  const drawnOnCanvas = isKeptSpriteSheet(frame.imageUrl);
  const [drawn, setDrawn] = useState(false);
  return (
    <div
      className={`pointer-events-none absolute bottom-full z-30 mb-5 w-(--preview-card-width) max-w-full -translate-x-1/2 ${PREVIEW_CARD_WIDTH_CLASS}`}
      style={{
        left: previewCardLeft(position),
        visibility: drawnOnCanvas && !drawn ? "hidden" : undefined,
      }}
      data-video-player-preview=""
      data-video-player-preview-mode="frame"
    >
      {chapterTitle ? (
        <p className="mb-1.5 truncate text-center text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {chapterTitle}
        </p>
      ) : null}
      <div className="relative">
        {/* No border: a raised surface, like the selected item of the
            app's side menu (its dark `--surface-depth-shadow`): a lit top
            and left edge and a darker bottom edge drawn over the picture
            (the ::after layer, edges only: the picture itself stays
            clean), and soft layered shadows beneath. Isolated, so the
            loading sweep over a picture not downloaded yet (z-1) stays
            under the time pill that overlaps the frame's bottom edge. */}
        <div
          data-video-player-preview-frame=""
          className="relative isolate overflow-hidden rounded-2xl bg-black shadow-[0_2px_6px_rgb(0_0_0/0.45),0_14px_32px_rgb(0_0_0/0.5),0_28px_56px_rgb(0_0_0/0.28)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_1px_0_0_rgb(255_255_255/0.1),inset_-1px_0_0_rgb(255_255_255/0.05),inset_0_-1px_0_rgb(0_0_0/0.35),inset_0_0_0_1px_rgb(255_255_255/0.07)] after:content-['']"
        >
          <StoryboardImage frame={frame} onDrawn={() => setDrawn(true)} />
        </div>
        {/* Half below the frame; the card's bottom margin keeps it clear of
            the timeline. A see-through pill, raised the same way. */}
        <span
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 ${PREVIEW_TIME_PILL_CLASS}`}
        >
          {formatMediaTime(previewTime)}
        </span>
      </div>
    </div>
  );
}

export type TimelinePreviewLayout = "follow" | "follow-pill" | "centered-pill";

interface TimelinePreviewProps {
  duration: number;
  previewTime: number;
  /** True while the timeline is dragged: the time only, no picture. */
  scrubbing?: boolean;
  /** The pointer of the drag in progress ("mouse", "touch", "pen"). */
  scrubPointerType?: string | null;
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
  scrubbing = false,
  scrubPointerType = null,
}: TimelinePreviewProps) {
  const controllerData = useTimelinePreviewData(previewTime);
  // While the timeline is dragged, the moment is shown over the whole video
  // (the real frame, or the storyboard frame drawn by `ScrubFrameOverlay`),
  // so no picture box covers it: only the time. Without a drag the preview
  // follows a hovering pointer (a mouse, on a phone too) as on desktop.
  const frame = scrubbing ? null : controllerData.frame;
  const chapterThumbnail = scrubbing
    ? null
    : controllerData.chapterThumbnailUrl;
  if (scrubbing && (layout === "centered-pill" || layout === "follow-pill")) {
    return (
      <ScrubTimePill
        // On the phone layout only: a desktop drag keeps to the time.
        chapterTitle={
          layout === "centered-pill" ? controllerData.chapterTitle : null
        }
        previewTime={previewTime}
        position={timeToPositionPercent(previewTime, duration)}
        touch={scrubPointerType === "touch"}
      />
    );
  }
  if (frame && (layout === "centered-pill" || layout === "follow-pill")) {
    return (
      <FramePreviewCard
        frame={frame}
        chapterTitle={controllerData.chapterTitle}
        previewTime={previewTime}
        position={timeToPositionPercent(previewTime, duration)}
      />
    );
  }
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
  const hasRichPreview = Boolean(frame || controllerData.chapterTitle);
  // A storyboard frame is the exact hovered moment and wins over the
  // chapter still, which only shows where the chapter begins.
  const chapterThumbnailUrl = frame ? null : chapterThumbnail;

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
      {frame ? (
        <div className="relative overflow-hidden bg-black">
          <StoryboardImage frame={frame} />
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
