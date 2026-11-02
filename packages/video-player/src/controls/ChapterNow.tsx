import { getChapterAtTime } from "../chapters/getChapterAtTime";
import { useChapters, usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";

/** Which chapter is playing (1-based) and how many there are; 0 for none. */
export function useChapterPosition(): { index: number; total: number } {
  const { chapters } = useChapters();
  const index = usePlayerState((snapshot) => {
    const chapter = getChapterAtTime(chapters, snapshot.media.currentTime);
    return chapter ? chapters.indexOf(chapter) + 1 : 0;
  });
  return { index, total: chapters.length };
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The chapter now playing, as the theme's `chrome.chapterLabel` words it
 * ("Modules Chapter 7 of 9"). Nothing when the theme has no label or the
 * video has no chapters.
 */
export function ChapterNowLabel({ className }: { className?: string }) {
  const template = usePlayerTheme().chrome?.chapterLabel;
  const { chapters } = useChapters();
  const { index, total } = useChapterPosition();
  const chapter = index > 0 ? chapters[index - 1] : undefined;
  if (!template || !chapter) return null;

  const values: Record<string, string> = {
    n: String(index),
    total: String(total),
    nn: pad(index),
    tt: pad(total),
  };
  const fill = (text: string) =>
    text
      .replace(/\{(\w+)\}/gu, (token, name: string) => values[name] ?? token)
      .trim();
  // The words before and after the chapter's name, each one run of text
  // ("> CH_07", "07/09"), and the name in its own span between them.
  const [before = "", ...rest] = template.split("{title}");
  const after = rest.join(" ");
  const hasTitle = rest.length > 0;
  const textClass =
    "shrink-0 font-semibold text-(--video-player-control-text-muted) tabular-nums";
  return (
    <span
      data-chapter-label=""
      title={chapter.title}
      className={`inline-flex min-w-0 items-baseline gap-1.5 truncate text-[0.8125rem] leading-none whitespace-nowrap ${className ?? ""}`}
    >
      {fill(before) ? (
        <span data-part="text" className={textClass}>
          {fill(before)}
        </span>
      ) : null}
      {hasTitle ? (
        <span data-part="title" className="min-w-0 truncate font-bold">
          {chapter.title}
        </span>
      ) : null}
      {fill(after) ? (
        <span data-part="text" className={textClass}>
          {fill(after)}
        </span>
      ) : null}
    </span>
  );
}

/** The chapter count a theme puts on its Chapters button (`chrome.chapterCount`). */
export function ChapterCountBadge() {
  const count = usePlayerTheme().chrome?.chapterCount;
  const { index, total } = useChapterPosition();
  if (!count || total === 0) return null;
  return (
    <span
      data-chapter-count={count}
      className="rounded-md bg-(--video-player-accent) px-1.5 py-1 text-[0.6875rem] leading-none font-bold text-(--video-player-accent-contrast) tabular-nums"
    >
      {count === "position" ? `${Math.max(index, 1)}/${total}` : total}
    </span>
  );
}
