import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Where the picture is taken from: just past the start, as WhatsApp does. */
const THUMB_TIME_SECONDS = 0.1;
/** Videos opened at once to take their picture. */
const MAX_DECODING = 2;
/** The picture is kept at most this large (its longer side, px). */
const FRAME_EDGE = 480;
/** Pictures remembered for videos already seen (newest kept). */
const MAX_FRAMES = 60;
/** A video that has given no picture by then is let go. */
const GIVE_UP_MS = 20_000;

const frames = new Map<string, HTMLCanvasElement>();
let decoding = 0;
const waiting: Array<() => void> = [];

function remember(key: string, frame: HTMLCanvasElement) {
  frames.delete(key);
  frames.set(key, frame);
  if (frames.size > MAX_FRAMES) {
    const oldest = frames.keys().next().value;
    if (oldest !== undefined) frames.delete(oldest);
  }
}

/**
 * A turn to open a video. `onTurn` is called when it comes (at once when
 * one is free) with the function that ends it; the same function is
 * returned, to give the turn up before it came.
 */
function takeTurn(onTurn: (release: () => void) => void): () => void {
  let state: "waiting" | "taken" | "done" = "waiting";
  const release = () => {
    if (state === "waiting") {
      const at = waiting.indexOf(start);
      if (at >= 0) waiting.splice(at, 1);
    } else if (state === "taken") {
      decoding -= 1;
      waiting.shift()?.();
    }
    state = "done";
  };
  function start() {
    state = "taken";
    decoding += 1;
    onTurn(release);
  }
  if (decoding < MAX_DECODING) start();
  else waiting.push(start);
  return release;
}

/**
 * A sent video's still picture, from the video itself (just past its
 * start, as WhatsApp shows).
 *
 * Each video is opened only to take that picture, two at a time, and let
 * go at once: the picture is kept on a canvas. A chat used to keep one
 * live video per thumbnail (the bubbles, reply quotes, the viewer's strip,
 * the chat's media), and an iPhone has only a few video decoders: with
 * many videos in a chat, the one opened in the viewer found none free and
 * failed at 0:00 ("This video can't play right now", 23 Nov 2026, an
 * iPhone screen recording, HEVC 1290 × 2796). A thumbnail now holds none.
 *
 * A phone browser loads only a video's details with `preload="metadata"`
 * and draws nothing, so the moment is asked for (`#t=`) and sought once the
 * details arrive, which makes it decode that frame.
 */
export function VideoThumb({
  src,
  className,
  onError,
}: {
  src: string;
  className?: string;
  onError?: () => void;
}) {
  const key = src.split("#")[0]!;
  const [phase, setPhase] = useState<
    "waiting" | "decoding" | "shown" | "failed"
  >(() => (frames.has(key) ? "shown" : "waiting"));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const releaseTurn = useRef<(() => void) | null>(null);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  // Another video in the same place (a list row reused): start again.
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setPhase(frames.has(key) ? "shown" : "waiting");
  }

  // Taken once it is near the screen, then in its turn.
  useEffect(() => {
    if (phase !== "waiting") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelTurn: (() => void) | null = null;
    const begin = () => {
      cancelTurn = takeTurn((release) => {
        // From here the turn is the decoding step's to end.
        releaseTurn.current = release;
        setPhase("decoding");
      });
    };
    if (typeof IntersectionObserver === "undefined") {
      begin();
      return () => cancelTurn?.();
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        begin();
      },
      { rootMargin: "300px" },
    );
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      // Gone before its turn came: the turn goes to the next one.
      if (releaseTurn.current !== cancelTurn) cancelTurn?.();
    };
  }, [phase, key]);

  // The video is opened for its turn and let go of (with its decoder) as
  // soon as the turn ends: with the picture, a failure, or the thumbnail
  // going. Set here rather than as a prop, so it is let go of at once and
  // not whenever the page forgets the element.
  const withTime = src.includes("#") ? src : `${src}#t=${THUMB_TIME_SECONDS}`;
  useEffect(() => {
    if (phase !== "decoding") return;
    const video = videoRef.current;
    if (!video) return;
    video.src = withTime;
    const giveUp = setTimeout(() => setPhase("failed"), GIVE_UP_MS);
    return () => {
      clearTimeout(giveUp);
      video.removeAttribute("src");
      video.load();
      releaseTurn.current?.();
      releaseTurn.current = null;
    };
  }, [phase, withTime]);

  // The kept picture, drawn before the screen updates (no blank frame).
  useLayoutEffect(() => {
    if (phase !== "shown") return;
    const frame = frames.get(key);
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext("2d")?.drawImage(frame, 0, 0);
  }, [phase, key]);

  /**
   * Takes the picture once the video shows the moment asked for: after the
   * seek, or as soon as it has data when the browser went there itself.
   */
  const capture = (video: HTMLVideoElement, sought: boolean) => {
    if (phase !== "decoding" || video.readyState < 2) return;
    if (!sought && video.currentTime < THUMB_TIME_SECONDS / 2) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    const scale = Math.min(1, FRAME_EDGE / Math.max(width, height));
    const frame = document.createElement("canvas");
    frame.width = Math.max(1, Math.round(width * scale));
    frame.height = Math.max(1, Math.round(height * scale));
    try {
      frame.getContext("2d")?.drawImage(video, 0, 0, frame.width, frame.height);
    } catch {
      setPhase("failed");
      return;
    }
    remember(key, frame);
    setPhase("shown");
  };

  if (phase !== "decoding") {
    return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
  }
  return (
    <video
      ref={videoRef}
      preload="metadata"
      muted
      playsInline
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
      onLoadedMetadata={(event) => {
        // Sought even when the browser is there already (`#t=`): the seek
        // decodes the frame and ends with `seeked`, where it is taken.
        const video = event.currentTarget;
        video.currentTime = Math.min(
          THUMB_TIME_SECONDS,
          Number.isFinite(video.duration) ? video.duration / 2 : 0,
        );
      }}
      onLoadedData={(event) => capture(event.currentTarget, false)}
      onSeeked={(event) => capture(event.currentTarget, true)}
      onError={() => {
        setPhase("failed");
        errorRef.current?.();
      }}
      className={className}
    />
  );
}
