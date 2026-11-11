import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { SpeakerHighIcon as SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

export interface LessonAudioPlayerProps {
  title?: string;
  subtitle?: string;
  /** The file's address; null while it is being fetched. */
  audioUrl?: string | null;
  /** Known length, shown until the file's own is read. */
  durationSeconds?: number;
  thumbnailUrl?: string | null;
  /** Where to start (a learner's saved place), in seconds. */
  initialTime?: number;
  /** Every second or so while it plays, and when it pauses. */
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  /**
   * The file could not be played (its address expired, say). Given, the
   * player offers to try again and calls this to get a new address.
   */
  onRetry?: () => void;
  /** Shown instead of the controls while true (an upload in progress). */
  unavailableText?: string | null;
  /**
   * "compact" fits a stage with its own controls along the bottom (the
   * lesson player): no fixed shape, a smaller picture.
   */
  variant?: "card" | "compact";
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

// Heights of the decorative waveform, in percent.
const WAVEFORM_BARS = [
  12, 18, 28, 42, 35, 60, 48, 75, 90, 85, 95, 80, 68, 55, 78, 88, 70, 92, 64,
  45, 80, 65, 50, 40, 30, 20, 15,
];

function formatTime(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const mmss = `${minutes}:${secs.toString().padStart(2, "0")}`;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : mmss;
}

/**
 * An audio lesson's player: the file plays in the page's own audio element,
 * with play, seeking, speed and volume, in the look of the lesson studio.
 */
export function LessonAudioPlayer({
  title = "Audio",
  subtitle,
  audioUrl,
  durationSeconds = 0,
  thumbnailUrl,
  initialTime = 0,
  onProgress,
  onEnded,
  onRetry,
  unavailableText = null,
  variant = "card",
}: LessonAudioPlayerProps) {
  const compact = variant === "compact";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(durationSeconds);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const playbackRateRef = useRef(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const isScrubbingRef = useRef(false);
  const lastReportRef = useRef(0);
  // A new address for the same file (one that expired) resumes in place.
  const resumeAtRef = useRef(initialTime);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    if (durationSeconds > 0) setDuration((known) => known || durationSeconds);
  }, [durationSeconds]);

  useEffect(() => {
    setFailed(false);
    setIsBuffering(Boolean(audioUrl));
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const report = (force: boolean) => {
      const now = audio.currentTime;
      if (!force && Math.abs(now - lastReportRef.current) < 1) return;
      lastReportRef.current = now;
      onProgressRef.current?.(now, audio.duration || duration);
    };
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      if (resumeAtRef.current > 0 && resumeAtRef.current < audio.duration) {
        audio.currentTime = resumeAtRef.current;
      }
      audio.playbackRate = playbackRateRef.current;
      setIsBuffering(false);
    };
    const handleTimeUpdate = () => {
      resumeAtRef.current = audio.currentTime;
      if (!isScrubbingRef.current) setCurrentTime(audio.currentTime);
      report(false);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      report(true);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleEnded = () => {
      setIsPlaying(false);
      report(true);
      onEndedRef.current?.();
    };
    const handleError = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setFailed(true);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("canplay", handlePlaying);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("canplay", handlePlaying);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
    // The listeners read the latest callbacks through refs; the element
    // is replaced only with its address, or when it is shown again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, unavailableText]);

  const canPlay = Boolean(audioUrl) && !failed && !unavailableText;

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    if (audio.paused) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [canPlay]);

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    const clamped = Math.max(0, Math.min(seconds, duration || seconds));
    setCurrentTime(clamped);
    resumeAtRef.current = clamped;
    if (audio) audio.currentTime = clamped;
  };

  const handleCycleSpeed = () => {
    const index = SPEEDS.indexOf(playbackRate as (typeof SPEEDS)[number]);
    const next = SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
    setPlaybackRate(next);
    playbackRateRef.current = next;
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  const handleVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(event.target.value);
    setVolume(value);
    setIsMuted(value === 0);
    if (audioRef.current) {
      audioRef.current.volume = value;
      audioRef.current.muted = value === 0;
    }
  };

  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;

  const statusText = unavailableText
    ? unavailableText
    : failed
      ? "This audio could not be played."
      : !audioUrl
        ? "Loading audio…"
        : null;

  return (
    <div
      className={`relative flex w-full flex-col justify-between overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_22%,#050814)_0%,_#05070e_100%)] text-white shadow-(--card-shadow) select-none ${
        compact ? "p-3.5 sm:p-5" : "aspect-video p-5 sm:p-7"
      }`}
    >
      {audioUrl && !unavailableText ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
        />
      ) : null}

      <div
        className={`flex-1 items-center min-h-0 ${
          // A phone's lesson stage is short: the controls alone fit above
          // the player's own row, and the stage already says "Audio".
          compact
            ? "hidden gap-3.5 min-[420px]:flex sm:gap-5"
            : "flex gap-5 sm:gap-7"
        }`}
      >
        <div
          className={`relative flex ${compact ? "h-14 w-14 sm:h-20 sm:w-20" : "h-24 w-24 sm:h-36 sm:w-36"} shrink-0 flex-col items-center justify-center overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_45%,#0c122c)_0%,_#0b0e1f_100%)] p-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.5)]`}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="relative flex items-center justify-center">
              <div className="absolute h-14 w-14 rounded-full bg-(--accent) opacity-35 blur-md" />
              <Headphones
                size={40}
                weight="fill"
                className="relative text-(--accent)"
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h3
            className={`m-0 truncate font-bold tracking-[-0.015em] text-white ${
              compact
                ? "text-[0.95rem] sm:text-[1.1rem]"
                : "text-[1.05rem] sm:text-[1.38rem]"
            }`}
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="m-0 mt-1 truncate text-[0.78rem] sm:text-[0.86rem] text-white/70">
              {subtitle}
            </p>
          ) : null}

          <div
            aria-hidden="true"
            className={`items-center gap-[3px] sm:gap-1 ${
              compact
                ? "mt-2.5 hidden h-8 min-[420px]:flex"
                : "mt-4 flex h-9 sm:mt-6 sm:h-12"
            }`}
          >
            {WAVEFORM_BARS.map((baseHeight, index) => {
              const isPast =
                (index / WAVEFORM_BARS.length) * 100 <= progressPercent &&
                progressPercent > 0;
              const height = isPlaying
                ? Math.max(
                    12,
                    Math.min(100, baseHeight + ((index % 5) * 6 - 12)),
                  )
                : baseHeight;
              return (
                <div
                  key={index}
                  style={{ height: `${height}%` }}
                  className={`w-[3px] sm:w-[4px] rounded-full transition-all duration-200 ${
                    isPast
                      ? "bg-[linear-gradient(180deg,#8b5cf6_0%,#3b82f6_100%)] shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                      : "bg-white/20"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div
        className={`flex flex-col gap-2 ${compact ? "min-[420px]:mt-3" : "mt-3"}`}
      >
        <div className="group relative flex h-4 w-full items-center">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            disabled={!canPlay || duration <= 0}
            onChange={(event) => seekTo(Number.parseFloat(event.target.value))}
            onPointerDown={() => {
              isScrubbingRef.current = true;
            }}
            onPointerUp={() => {
              isScrubbingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === " ") {
                event.preventDefault();
                togglePlay();
              }
            }}
            aria-label="Seek"
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
          <div className="relative h-1.5 w-full rounded-full bg-white/20 transition-all group-hover:h-2">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full rounded-full bg-(--accent) shadow-[0_0_8px_var(--accent)]"
            />
            <div
              style={{ left: `${progressPercent}%` }}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-125"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-white/80">
          <div className="flex min-w-0 items-center gap-3">
            {failed && onRetry ? (
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  onRetry();
                }}
                aria-label="Try again"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
              >
                <ArrowClockwise size={17} weight="bold" />
              </button>
            ) : (
              <button
                type="button"
                onClick={togglePlay}
                disabled={!canPlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm transition-all hover:scale-105 hover:bg-white/20 active:scale-95 cursor-pointer disabled:cursor-default disabled:opacity-50 disabled:hover:scale-100"
              >
                {isBuffering && isPlaying ? (
                  <CircleNotch size={17} className="animate-spin" />
                ) : isPlaying ? (
                  <Pause size={17} weight="fill" />
                ) : (
                  <Play size={17} weight="fill" className="ml-0.5" />
                )}
              </button>
            )}

            <span
              className="truncate text-[0.8rem] font-medium tabular-nums text-white/90"
              aria-live={statusText ? "polite" : undefined}
            >
              {statusText ??
                `${formatTime(currentTime)} / ${duration > 0 ? formatTime(duration) : "--:--"}`}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <SpeakerSlash size={17} />
                ) : (
                  <SpeakerHigh size={17} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolume}
                aria-label="Volume"
                className="hidden h-1 w-14 cursor-pointer accent-(--accent) sm:block sm:w-18"
              />
            </div>

            <button
              type="button"
              onClick={handleCycleSpeed}
              aria-label={`Playback speed ${playbackRate}x`}
              title="Playback speed"
              className="flex h-7 min-w-10 items-center justify-center rounded-[6px] border border-white/20 bg-white/10 px-2 text-[0.74rem] font-semibold tabular-nums text-white/90 hover:bg-white/20 transition-colors cursor-pointer"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
