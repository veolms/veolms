import {
  type Chapter,
  formatMediaTime,
  useChapters,
  useCurrentTime,
  usePlayerController,
} from "@veolms/video-player";

import { useState } from "react";

import { cn } from "../../../lib/utils";

/**
 * `app` sits on the workspace chrome and follows the application theme;
 * `player` sits on top of the video and follows the player theme.
 */
export type LessonChaptersTone = "app" | "player";

const TONE_CLASSES: Record<
  LessonChaptersTone,
  {
    row: string;
    activeRow: string;
    title: string;
    muted: string;
    accent: string;
    accentFill: string;
    placeholder: string;
    focus: string;
  }
> = {
  app: {
    row: "hover:bg-(--hover) focus-visible:bg-(--hover)",
    activeRow:
      "bg-[color-mix(in_srgb,var(--accent)_11%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]",
    title: "text-(--text)",
    muted: "text-(--text-secondary)",
    accent: "text-(--accent)",
    accentFill: "bg-(--accent)",
    placeholder: "bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] text-(--text-secondary)",
    focus: "focus-visible:outline-(--accent)",
  },
  player: {
    row: "hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_9%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_9%,transparent)]",
    activeRow:
      "bg-[color-mix(in_srgb,var(--video-player-accent)_16%,transparent)] hover:bg-[color-mix(in_srgb,var(--video-player-accent)_21%,transparent)]",
    title: "text-(--video-player-menu-text)",
    muted: "text-(--video-player-menu-text-muted)",
    accent: "text-(--video-player-menu-text)",
    accentFill: "bg-(--video-player-accent)",
    placeholder:
      "bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] text-(--video-player-menu-text-muted)",
    focus: "focus-visible:outline-(--video-player-menu-text)",
  },
};

function ChapterThumbnail({
  chapter,
  index,
  tone,
}: {
  chapter: Chapter;
  index: number;
  tone: LessonChaptersTone;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = chapter.thumbnailUrl;

  if (!url || failedUrl === url) {
    // Until a still exists the tile carries the chapter number, so the row
    // keeps its shape and the list stays scannable.
    return (
      <span
        aria-hidden="true"
        className={cn(
          "grid size-full place-items-center text-sm font-semibold tabular-nums",
          TONE_CLASSES[tone].placeholder,
        )}
      >
        {index + 1}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="size-full bg-black object-cover"
      onError={() => setFailedUrl(url)}
    />
  );
}

/** Thin fill under the playing chapter's still. Only this node ticks. */
function ActiveChapterProgress({ chapter, tone }: { chapter: Chapter; tone: LessonChaptersTone }) {
  const currentTime = useCurrentTime();
  const span = (chapter.endTime ?? chapter.startTime) - chapter.startTime;
  if (span <= 0) return null;
  const percent = Math.min(100, Math.max(0, ((currentTime - chapter.startTime) / span) * 100));

  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.75 bg-black/45">
      <span
        className={cn("block h-full", TONE_CLASSES[tone].accentFill)}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

export interface LessonChapterRowsProps {
  tone: LessonChaptersTone;
  /** Rows act as menu items inside the mobile sheet, plain buttons elsewhere. */
  asMenuItems?: boolean;
  onChapterSelect?: (chapter: Chapter) => void;
}

export function LessonChapterRows({
  asMenuItems = false,
  onChapterSelect,
  tone,
}: LessonChapterRowsProps) {
  const controller = usePlayerController();
  const { activeChapterId, chapters } = useChapters();
  const classes = TONE_CLASSES[tone];

  return (
    <>
      {chapters.map((chapter, index) => {
        const active = chapter.id === activeChapterId;
        const length =
          chapter.endTime !== undefined && chapter.endTime > chapter.startTime
            ? chapter.endTime - chapter.startTime
            : null;

        return (
          <button
            key={chapter.id}
            type="button"
            role={asMenuItems ? "menuitemradio" : undefined}
            aria-checked={asMenuItems ? active : undefined}
            aria-current={!asMenuItems && active ? "true" : undefined}
            tabIndex={asMenuItems ? -1 : undefined}
            data-lesson-chapter-row=""
            data-active={active ? "true" : undefined}
            className={cn(
              "group/chapter relative flex w-full items-center gap-3 rounded-xl py-2 pr-3 pl-3.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2",
              // The accent rail alone marks the playing chapter.
              "before:absolute before:inset-y-2.5 before:left-0 before:w-0.75 before:rounded-full before:opacity-0 before:transition-opacity before:duration-200 before:content-['']",
              tone === "app" ? "before:bg-(--accent)" : "before:bg-(--video-player-accent)",
              classes.focus,
              active ? cn(classes.activeRow, "before:opacity-100") : classes.row,
            )}
            onClick={() => {
              controller.seekTo(chapter.startTime);
              onChapterSelect?.(chapter);
            }}
          >
            <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.24)] transition-transform duration-200 ease-out group-hover/chapter:scale-[1.03] motion-reduce:transition-none">
              <ChapterThumbnail chapter={chapter} index={index} tone={tone} />
              {active ? <ActiveChapterProgress chapter={chapter} tone={tone} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "line-clamp-2 text-sm leading-snug",
                  active ? "font-semibold" : "font-medium",
                  classes.title,
                )}
              >
                {chapter.title}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs tabular-nums">
                <span className={cn("font-semibold", classes.accent)}>
                  {formatMediaTime(chapter.startTime)}
                </span>
                {length !== null ? (
                  <>
                    <span aria-hidden="true" className={classes.muted}>
                      ·
                    </span>
                    <span className={classes.muted}>{formatMediaTime(length)}</span>
                  </>
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}
