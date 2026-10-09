import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type { VideoEngine } from "@veolms/video-player";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { isEditingShortcutTarget } from "../../keyboardShortcuts";
import type { HeroLaptopVideoLesson } from "./heroLaptopVideoEngine";

/** How long the button stays after a playing video is tapped. */
const BUTTON_VISIBLE_MS = 2500;

/**
 * A lesson's video for the hero's laptop, with one control: a play and pause
 * button in the middle of the screen.
 *
 * The button is there when the page loads and goes as soon as the video
 * plays. From then on a mouse brings it back only while it is over the
 * screen, playing or paused. Without a mouse there is no "over": a tap on
 * the playing video brings the button back for a moment (to pause), and it
 * stays while the video is paused. Nothing of the player or the stream is
 * fetched until the visitor first presses play.
 */
export function HeroLaptopVideo({
  lesson,
  poster,
}: {
  lesson: HeroLaptopVideoLesson;
  /** Shown on the screen until the video is played. */
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<VideoEngine | undefined>(undefined);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const inViewRef = useRef(true);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">(
    "idle",
  );
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [usesMouse, setUsesMouse] = useState(false);
  const [buttonCalled, setButtonCalled] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onPlaying = () => {
      setPlaying(true);
      setHasPlayed(true);
      setButtonCalled(false);
    };
    const onStopped = () => setPlaying(false);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onStopped);
    video.addEventListener("ended", onStopped);

    // A video left playing out of sight would keep talking over the page.
    // The hero is watched rather than the video, whose own box is laid out
    // at full size before it is fitted onto the laptop.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      inViewRef.current = entry.isIntersecting;
      if (!entry.isIntersecting) engineRef.current?.pause();
    });
    observer.observe(video.closest("section") ?? video);

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onStopped);
      video.removeEventListener("ended", onStopped);
      observer.disconnect();
      window.clearTimeout(hideTimerRef.current);
      void engineRef.current?.destroy().catch(() => undefined);
      engineRef.current = undefined;
    };
  }, []);

  const togglePlayback = async () => {
    window.clearTimeout(hideTimerRef.current);
    const video = videoRef.current;
    if (!video || status === "loading") return;

    if (engineRef.current) {
      if (video.paused || video.ended) {
        await engineRef.current.play().catch(() => undefined);
      } else {
        engineRef.current.pause();
      }
      return;
    }

    setStatus("loading");
    try {
      const { loadHeroLaptopVideo } = await import("./heroLaptopVideoEngine");
      const engine = await loadHeroLaptopVideo(video, lesson);
      // Left while it was loading.
      if (videoRef.current !== video) {
        void engine.destroy().catch(() => undefined);
        return;
      }
      engineRef.current = engine;
      setStatus("ready");
      await engine.play().catch(() => undefined);
    } catch {
      setStatus("failed");
    }
  };

  // Space plays and pauses from anywhere on the page while the laptop is in
  // view. It is left alone where it already means something: in a text field,
  // on a control it would press, in a dialog, and once the laptop has
  // scrolled away (where it pages down as usual).
  const togglePlaybackRef = useRef(togglePlayback);
  useEffect(() => {
    togglePlaybackRef.current = togglePlayback;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        !inViewRef.current ||
        isEditingShortcutTarget(event.target)
      ) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'button, a[href], summary, select, input, [role="button"], [role="dialog"], [role="menu"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      void togglePlaybackRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** A tap on the playing video itself calls the button up for a moment. */
  const callButton = () => {
    if (!playing) return;
    setButtonCalled(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(
      () => setButtonCalled(false),
      BUTTON_VISIBLE_MS,
    );
  };

  const buttonVisible =
    hovered || buttonCalled || (!playing && (!hasPlayed || !usesMouse));
  const label =
    status === "loading" ? "Loading video" : playing ? "Pause" : "Play video";

  return (
    <div
      className="relative size-full bg-black"
      onClick={callButton}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        setUsesMouse(true);
        setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        preload="none"
        className="size-full object-cover"
      />
      {status === "failed" ? null : (
        <button
          type="button"
          aria-label={label}
          title={label}
          tabIndex={buttonVisible ? 0 : -1}
          onClick={(event) => {
            // Its own press must not count as a tap on the video.
            event.stopPropagation();
            setButtonCalled(false);
            void togglePlayback();
          }}
          // The screen is drawn far smaller than it is laid out, most of all
          // on a phone, so the button is large here to be a fair target there.
          // A dark, see-through disc (no blur) keeps the icon readable over
          // a bright frame.
          className={`absolute top-1/2 left-1/2 grid size-56 -translate-1/2 cursor-pointer place-items-center rounded-full bg-black/45 text-white transition-[opacity,background-color] duration-200 hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none sm:size-36 ${
            buttonVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {status === "loading" ? (
            <LoadingSpinnerIcon size={96} />
          ) : playing ? (
            <Pause weight="fill" className="size-48 sm:size-24" />
          ) : (
            // The icon's triangle is drawn a little right of its box's
            // middle already, which is where it looks centred in the disc.
            <Play
              weight="fill"
              className="size-48 translate-x-[1%] sm:size-24"
            />
          )}
        </button>
      )}
    </div>
  );
}
