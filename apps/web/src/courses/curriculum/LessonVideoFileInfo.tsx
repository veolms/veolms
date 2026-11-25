import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { YoutubeLogoIcon as YoutubeLogo } from "@phosphor-icons/react/YoutubeLogo";
import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../lib/clipboard";
import { useMediaSource } from "../../services/media";

/** How long the copy button shows its answer before it is "Copy" again. */
const COPIED_FOR_MS = 1800;

const nameClass =
  "m-0 truncate text-[0.82rem] sm:text-[0.86rem] font-bold text-(--text)";
const metaClass =
  "m-0 mt-0.5 truncate text-[0.70rem] sm:text-[0.74rem] text-(--muted)";

export interface LessonVideoFileInfoProps {
  mediaId: string;
  /** The file's name, shown when the video has no YouTube title. */
  fileName: string;
  /** Size, dimensions and length, already joined. */
  meta: string;
}

/**
 * The name and details of a lesson's video. A video imported from (or
 * mapped to) a YouTube video shows that video's title, linked to it, with
 * a "From YouTube" badge and a button that copies the link. Any other
 * video, or one whose source cannot be read, shows its file name.
 */
export function LessonVideoFileInfo({
  mediaId,
  fileName,
  meta,
}: LessonVideoFileInfoProps) {
  const source = useMediaSource(mediaId).data?.source;

  if (source?.provider !== "youtube") {
    return (
      <div className="min-w-0">
        <p className={nameClass} title={fileName}>
          {fileName}
        </p>
        <p className={metaClass}>{meta}</p>
      </div>
    );
  }

  const title = source.title ?? fileName;
  return (
    <div className="min-w-0">
      {/* A long title wraps to a second line, then ends in "…". */}
      <div className="flex min-w-0 items-center gap-1">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${title}\n${source.url}`}
          aria-label={`${title} (opens on YouTube in a new tab)`}
          className="m-0 text-[0.82rem] sm:text-[0.86rem] font-bold text-(--text) leading-snug group inline-flex min-w-0 items-center gap-1 rounded-[4px] no-underline underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          <span className="line-clamp-2 min-w-0 break-words">{title}</span>
          <ArrowSquareOut
            size={13}
            weight="bold"
            aria-hidden="true"
            className="shrink-0 text-(--muted) group-hover:text-(--text)"
          />
        </a>
        <CopyYoutubeLinkButton url={source.url} />
      </div>
      <p className={`${metaClass} flex min-w-0 items-center gap-1.5`}>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-red-500/12 px-1.5 py-px text-[0.66rem] sm:text-[0.68rem] font-semibold text-red-500">
          <YoutubeLogo size={12} weight="fill" aria-hidden="true" />
          From YouTube
        </span>
        <span className="min-w-0 truncate">{meta}</span>
      </p>
    </div>
  );
}

/**
 * Copies the YouTube link. The answer shows on the button itself: a green
 * tick, or a red warning when the browser refuses the copy; screen readers
 * are told the same.
 */
function CopyYoutubeLinkButton({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  async function copy() {
    const copied = await copyTextToClipboard(url);
    setState(copied ? "copied" : "failed");
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(
      () => setState("idle"),
      COPIED_FOR_MS,
    );
  }

  const copied = state === "copied";
  const failed = state === "failed";
  const label = copied
    ? "YouTube link copied"
    : failed
      ? "Could not copy the YouTube link"
      : "Copy YouTube link";
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        title={label}
        className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${
          copied
            ? "bg-emerald-500/14 text-emerald-500"
            : failed
              ? "bg-rose-500/12 text-rose-500"
              : "bg-transparent text-(--muted) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
        }`}
      >
        {copied ? (
          <Check
            key="copied"
            size={14}
            weight="bold"
            aria-hidden="true"
            className="animate-in zoom-in-50 spin-in-12 duration-200"
          />
        ) : failed ? (
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
        ) : (
          <Copy size={14} weight="bold" aria-hidden="true" />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied" : failed ? "Could not copy the link" : ""}
      </span>
    </>
  );
}
