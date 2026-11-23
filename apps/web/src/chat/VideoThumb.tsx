import type { VideoHTMLAttributes } from "react";

import { useChatVideoStill } from "./useChatMediaSource";

/** Where the picture is taken from: just past the start, as WhatsApp does. */
const THUMB_TIME_SECONDS = 0.1;

/**
 * A sent video's still picture. A video played before has one kept on this
 * device (chat/chatMediaSource.ts), shown as a plain picture: nothing is
 * downloaded and no video is decoded for it.
 *
 * Otherwise it comes from the video itself. A phone browser (Android
 * Chrome, iOS Safari) loads only a video's details with `preload="metadata"`
 * and draws nothing, so the bubble stayed an empty box with a play button.
 * Asking for a moment just past the start (`#t=`), and seeking there once
 * the details arrive, makes it decode and show that frame; a computer shows
 * it the same way.
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
  const still = useChatVideoStill(src);
  if (still.src) {
    return (
      <img
        src={still.src}
        alt=""
        decoding="async"
        draggable={false}
        onError={still.fallBack}
        className={className}
      />
    );
  }
  const withTime = src.includes("#") ? src : `${src}#t=${THUMB_TIME_SECONDS}`;
  return (
    <video
      // Not before the device has said whether it keeps a still.
      src={still.settled ? withTime : undefined}
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
      onError={onError}
      className={className}
    />
  );
}
