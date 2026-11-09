import { useEffect, useRef, useState } from "react";
import type { VideoEngine } from "@veolms/video-player";
import { XIcon as X } from "@phosphor-icons/react/X";

/**
 * A session's recording, playing in a 16:9 frame above the session list.
 * The stream and its tokens come from the workshop's own playback routes,
 * so only people the API lets through can watch.
 */
export function WorkshopRecordingPlayer({
  workshopId,
  sessionId,
  title,
  onClose,
}: {
  workshopId: string;
  sessionId: string;
  title: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);

    let engine: VideoEngine | undefined;
    let cancelled = false;
    void import("./workshopRecordingEngine")
      .then(({ loadWorkshopRecording }) =>
        loadWorkshopRecording(video, workshopId, sessionId),
      )
      .then(async (loaded) => {
        if (cancelled) {
          await loaded.destroy().catch(() => undefined);
          return;
        }
        engine = loaded;
        await loaded.play().catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        console.error("Workshop recording playback failed", caught);
        const failure = caught as
          { status?: number; response?: { status?: number } } | undefined;
        const status = failure?.status ?? failure?.response?.status;
        setError(
          status === 409
            ? "The recording is still being prepared. Try again in a moment."
            : status === 403
              ? "Recordings are for the workshop's registrants."
              : "The recording could not be played.",
        );
      });

    return () => {
      cancelled = true;
      void engine?.destroy().catch(() => undefined);
    };
  }, [workshopId, sessionId]);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-(--text)">
          Recording · {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the recording"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-(--text)"
        >
          <X size={16} weight="bold" />
        </button>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          className="block h-full w-full object-contain"
          aria-label={`Recording of ${title}`}
        />
        {error ? (
          <p
            className="absolute inset-x-3 bottom-3 m-0 rounded-md bg-black/70 px-3 py-2 text-center text-[0.78rem] text-white"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
