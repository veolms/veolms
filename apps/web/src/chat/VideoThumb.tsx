import { useEffect, useState, type VideoHTMLAttributes } from "react";

import { chatService } from "../services/chat";

/** Where the picture is taken from: just past the start, as WhatsApp does. */
const THUMB_TIME_SECONDS = 0.1;

/**
 * A sent video's still picture, from the video itself. A phone browser
 * (Android Chrome, iOS Safari) loads only a video's details with
 * `preload="metadata"` and draws nothing, so the bubble stayed an empty box
 * with a play button. Asking for a moment just past the start (`#t=`), and
 * seeking there once the details arrive, makes it decode and show that
 * frame; a computer shows it the same way.
 */
export function VideoThumb({
  src,
  className,
  onError,
}: {
  src: string;
  className?: string;
  onError?: VideoHTMLAttributes<HTMLVideoElement>["onError"];
}) {
  const [shown, setShown] = useState(src);
  useEffect(() => setShown(src), [src]);
  const withTime = shown.includes("#")
    ? shown
    : `${shown}#t=${THUMB_TIME_SECONDS}`;
  return (
    <video
      src={withTime}
      preload="metadata"
      muted
      playsInline
      disablePictureInPicture
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (video.currentTime < THUMB_TIME_SECONDS / 2) {
          video.currentTime = Math.min(
            THUMB_TIME_SECONDS,
            Number.isFinite(video.duration) ? video.duration / 2 : 0,
          );
        }
      }}
      onError={(event) => {
        // A CDN link that stopped working: read through the API.
        const fallback = chatService.fileFallbackUrl(shown);
        if (fallback) setShown(fallback);
        else onError?.(event);
      }}
      className={className}
    />
  );
}
