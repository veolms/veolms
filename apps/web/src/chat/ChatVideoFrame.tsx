import { useState, type CSSProperties } from "react";

import { FileVideoPlayer } from "../components/video";
import { cn } from "../lib/utils";

/**
 * A chat video at its own shape, as large as the space allows: a phone's
 * upright video fills the height (WhatsApp), a wide one the width.
 *
 * The space is measured with container units, so the frame never breaks
 * its shape when the room left (header, thumbnails, caption box) is less
 * than the screen. The shape comes from the size saved with the message
 * and is corrected from the file itself once it loads: older messages
 * and some phone videos were saved without one, or with a made-up 16:9.
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
      >
        <FileVideoPlayer
          src={src}
          mimeType={mimeType}
          title={title}
          autoPlay={autoPlay}
          keyboardEnabled={keyboardEnabled}
          fillFrame
        />
      </div>
    </div>
  );
}
