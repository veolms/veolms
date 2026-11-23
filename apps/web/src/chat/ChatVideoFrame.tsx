import { useEffect, useRef, useState, type CSSProperties } from "react";

import { FileVideoPlayer } from "../components/video";
import { cn } from "../lib/utils";
import { keepVideo, makePoster } from "./chatMediaSource";
import { useChatVideoSource } from "./useChatMediaSource";

/**
 * A video watched this long (or to its end) is downloaded once more behind
 * the playback and kept on this device; one skipped past is not.
 */
const KEEP_AFTER_SECONDS = 3;

/**
 * A chat video at its own shape, as large as the space allows: a phone's
 * upright video fills the height (WhatsApp), a wide one the width.
 *
 * The space is measured with container units, so the frame never breaks
 * its shape when the room left (header, thumbnails, caption box) is less
 * than the screen. The shape comes from the size saved with the message
 * and is corrected from the file itself once it loads: older messages
 * and some phone videos were saved without one, or with a made-up 16:9.
 *
 * A video played before plays from this device (chat/chatMediaSource.ts):
 * nothing is downloaded, and it plays with no connection.
 */
export function ChatVideoFrame({
  src,
  mimeType,
  title,
  width,
  height,
  autoPlay = false,
  keyboardEnabled = true,
  className,
}: {
  src: string;
  mimeType?: string;
  title: string;
  width?: number | null;
  height?: number | null;
  autoPlay?: boolean;
  keyboardEnabled?: boolean;
  className?: string;
}) {
  const [measured, setMeasured] = useState<number | null>(null);
  const saved = width && height ? width / height : null;
  const ratio = measured ?? saved ?? 16 / 9;
  const media = useChatVideoSource(src);
  const keepAsked = useRef<string | null>(null);
  const keep = (video: HTMLVideoElement, ended = false) => {
    if (media.local || !media.uploadId || keepAsked.current === src) return;
    if (!ended && video.currentTime < KEEP_AFTER_SECONDS) return;
    keepAsked.current = src;
    keepVideo(media.uploadId, mimeType ?? "video/mp4");
  };
  // Kept before stills were: the bubble's still picture is made now.
  useEffect(() => {
    if (media.local && media.uploadId) void makePoster(media.uploadId);
  }, [media.local, media.uploadId]);

  return (
    <div className="flex size-full items-center justify-center [container-type:size]">
      <div
        className={cn(
          "w-[min(100cqw,calc(100cqh*var(--chat-video-ratio)))]",
          className,
        )}
        style={
          {
            "--chat-video-ratio": ratio,
            aspectRatio: String(ratio),
          } as CSSProperties
        }
        onClick={(event) => event.stopPropagation()}
        // Media events don't bubble, but they pass this box on the way
        // down: the video's real shape, whatever the message says.
        onLoadedMetadataCapture={(event) => {
          const video = event.target as HTMLVideoElement;
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            setMeasured(video.videoWidth / video.videoHeight);
          }
        }}
        onTimeUpdateCapture={(event) => keep(event.target as HTMLVideoElement)}
        onEndedCapture={(event) => keep(event.target as HTMLVideoElement, true)}
      >
        {media.src ? (
          <FileVideoPlayer
            src={media.src}
            mimeType={mimeType}
            title={title}
            autoPlay={autoPlay}
            keyboardEnabled={keyboardEnabled}
            fillFrame
            // This device's copy did not play: the network's is used.
            onError={media.local ? media.fallBack : undefined}
          />
        ) : (
          // The device is asked first (milliseconds), so the player never
          // starts on the network only to switch.
          <div
            className="size-full bg-black"
            aria-busy="true"
            aria-label={`Loading video: ${title}`}
          />
        )}
      </div>
    </div>
  );
}
