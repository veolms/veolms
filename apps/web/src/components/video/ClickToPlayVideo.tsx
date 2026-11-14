import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { FileVideoPlayer, type FileVideoPlayerProps } from "./index";

/**
 * A video in a list or a post: a play button until it is asked for, then
 * the app's player, playing. Nothing of the file (or the player) loads
 * before the press. Built of inline elements, so it may sit in a paragraph.
 */
export function ClickToPlayVideo({
  className,
  ...player
}: Omit<FileVideoPlayerProps, "autoPlay">) {
  const [playing, setPlaying] = useState(false);
  return (
    <span
      className={cn(
        "relative block aspect-video w-full overflow-hidden rounded-xl bg-black",
        className,
      )}
    >
      {playing ? (
        <FileVideoPlayer {...player} autoPlay />
      ) : (
        <button
          type="button"
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 border-0 bg-transparent text-white focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-(--accent)"
          aria-label={`Play video ${player.title}`}
          onClick={() => setPlaying(true)}
        >
          <span className="grid size-14 place-items-center rounded-full bg-white/15 backdrop-blur-xs">
            <Play size={28} weight="fill" />
          </span>
          <span className="max-w-[80%] truncate text-sm font-semibold">
            {player.title}
          </span>
        </button>
      )}
    </span>
  );
}
