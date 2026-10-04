import { getPlayerThemeStyle, useChapters, usePlayerTheme } from "@veolms/video-player";

import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useRef } from "react";

import { cn } from "../../../lib/utils";

import { LessonChapterRows } from "./LessonChapterRows";

export interface LessonChaptersPanelProps {
  id: string;
  open: boolean;
  lessonTitle?: string;
  /**
   * `side` covers the course content column; `player` slides over the right
   * edge of the video when that column is not on screen.
   */
  placement: "side" | "player";
  onClose: () => void;
}

/**
 * Stays mounted while closed so both directions of the slide animate; the
 * closed panel is inert and hidden from assistive technology.
 */
export function LessonChaptersPanel({
  id,
  lessonTitle,
  onClose,
  open,
  placement,
}: LessonChaptersPanelProps) {
  const playerTheme = usePlayerTheme();
  const { activeChapterId, chapters } = useChapters();
  const listRef = useRef<HTMLDivElement>(null);
  const inPlayer = placement === "player";

  // Keep the playing chapter in view without scrolling the page itself.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>("[data-active='true']");
    if (!list || !row) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    if (rowTop < list.scrollTop || rowBottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({
        top: rowTop - (list.clientHeight - row.offsetHeight) / 2,
        behavior: "smooth",
      });
    }
  }, [activeChapterId, open]);

  return (
    <aside
      id={id}
      aria-label="Chapters"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : true}
      data-lesson-chapters-panel={placement}
      data-video-player-control-layer={inPlayer ? "" : undefined}
      style={inPlayer ? getPlayerThemeStyle(playerTheme) : undefined}
      className={cn(
        "pointer-events-auto absolute inset-y-0 right-0 flex flex-col transition-[translate,visibility,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        open ? "visible translate-x-0" : "invisible translate-x-full",
        inPlayer
          ? "z-190 w-[min(22rem,88%)] rounded-l-2xl bg-[color-mix(in_srgb,var(--video-player-menu-solid-surface,rgb(11_11_13))_90%,transparent)] text-(--video-player-menu-text) shadow-[-18px_0_48px_rgba(0,0,0,0.42)] backdrop-blur-md"
          : "w-full border-l border-(--border) bg-(--surface) text-(--text) shadow-[-12px_0_32px_color-mix(in_srgb,black_14%,transparent)]",
      )}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex items-center gap-2 text-xs font-semibold tracking-[0.08em] uppercase",
              inPlayer ? "text-(--video-player-menu-text-muted)" : "text-(--accent)",
            )}
          >
            Chapters
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none tracking-normal tabular-nums",
                inPlayer
                  ? "bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_12%,transparent)]"
                  : "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]",
              )}
            >
              {chapters.length}
            </span>
          </p>
          {lessonTitle ? (
            <h2 className="mt-1.5 line-clamp-2 text-base leading-snug font-semibold tracking-[-0.01em]">
              {lessonTitle}
            </h2>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close chapters"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
            inPlayer
              ? "bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_18%,transparent)] focus-visible:outline-(--video-player-menu-text)"
              : "bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) focus-visible:outline-(--accent)",
          )}
          onClick={onClose}
        >
          <X size={17} weight="bold" />
        </button>
      </header>
      <div
        ref={listRef}
        className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2.5 pb-4"
      >
        <LessonChapterRows tone={inPlayer ? "player" : "app"} />
      </div>
    </aside>
  );
}
