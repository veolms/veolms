import { lazy, Suspense } from "react";

import { LoadingSpinnerIcon } from "../LoadingSpinner";
import type { FileVideoPlayerProps } from "./FileVideoPlayer";

export type { FileVideoPlayerProps };

const FileVideoPlayerImpl = lazy(() => import("./FileVideoPlayer"));

/**
 * The app's player for a single video file, loaded when a video is first
 * shown (the player and Shaka stay out of the pages' first download).
 */
export function FileVideoPlayer(props: FileVideoPlayerProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`grid size-full place-items-center bg-black ${props.className ?? ""}`}
          aria-busy="true"
          aria-label={`Loading video: ${props.title}`}
        >
          <LoadingSpinnerIcon size={30} />
        </div>
      }
    >
      <FileVideoPlayerImpl {...props} />
    </Suspense>
  );
}
