import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ClockClockwiseIcon as ClockClockwise } from "@phosphor-icons/react/ClockClockwise";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { SpeakerHighIcon as SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import {
  formatAudioTime,
  LESSON_AUDIO_SKIP_SECONDS,
  useLessonAudio,
} from "./useLessonAudio";

export interface LessonAudioPlayerProps {
  title?: string;
  subtitle?: string;
  /** The file's address; null while it is being fetched. */
  audioUrl?: string | null;
  /** Known length, shown until the file's own is read. */
  durationSeconds?: number;
  thumbnailUrl?: string | null;
  /** Shown instead of the controls while set (the file could not load). */
  unavailableText?: string | null;
  /** The file could not be played: asks for a new address. */
  onRetry?: () => void;
}

// Heights of the decorative waveform, in percent.
const WAVEFORM_BARS = [
  12, 18, 28, 42, 35, 60, 48, 75, 90, 85, 95, 80, 68, 55, 78, 88, 70, 92, 64,
  45, 80, 65, 50, 40, 30, 20, 15,
];

/**
 * An audio file's preview in the lesson studio: it plays in the page's own
 * audio element (see `useLessonAudio`), in the studio's card.
 */
export function LessonAudioPlayer({
  title = "Audio",
  subtitle,
  audioUrl,
  durationSeconds = 0,
  thumbnailUrl,
  unavailableText = null,
  onRetry,
}: LessonAudioPlayerProps) {
  const audio = useLessonAudio({
    audioUrl: unavailableText ? null : audioUrl,
    durationSeconds,
  });
  const failed = audio.failed;
  const canPlay = audio.canPlay && !unavailableText;
  const statusText =
    unavailableText ??
    (failed
      ? "This audio could not be played."
      : !audioUrl
        ? "Loading audio…"
        : null);

  return (
    <div className="relative flex aspect-video w-full flex-col justify-between overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_22%,#050814)_0%,_#05070e_100%)] p-5 text-white shadow-(--card-shadow) select-none sm:p-7">
      {audioUrl && !unavailableText ? (
        <audio
          ref={audio.audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
        />
      ) : null}

      <div className="flex min-h-0 flex-1 items-center gap-5 sm:gap-7">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_45%,#0c122c)_0%,_#0b0e1f_100%)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] sm:h-36 sm:w-36">
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
          <h3 className="m-0 truncate text-[1.05rem] font-bold tracking-[-0.015em] text-white sm:text-[1.38rem]">
            {title}
          </h3>
          {subtitle ? (
            <p className="m-0 mt-1 truncate text-[0.78rem] text-white/70 sm:text-[0.86rem]">
              {subtitle}
            </p>
          ) : null}
          <div
            aria-hidden="true"
            className="mt-4 flex h-9 items-center gap-[3px] sm:mt-6 sm:h-12 sm:gap-1"
          >
            {WAVEFORM_BARS.map((baseHeight, index) => {
              const isPast =
                audio.progressPercent > 0 &&
                (index / WAVEFORM_BARS.length) * 100 <= audio.progressPercent;
              const height = audio.isPlaying
                ? Math.max(
                    12,
                    Math.min(100, baseHeight + ((index % 5) * 6 - 12)),
                  )
                : baseHeight;
              return (
                <div
                  key={index}
                  style={{ height: `${height}%` }}
                  className={`w-[3px] rounded-full transition-all duration-200 sm:w-[4px] ${
                    isPast ? "bg-(--accent)" : "bg-white/20"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <AudioSeekBar audio={audio} disabled={!canPlay} />
        <div className="flex items-center justify-between gap-2 text-xs text-white/80">
          <div className="flex min-w-0 items-center gap-1.5">
            {failed && onRetry ? (
              <button
                type="button"
                onClick={() => {
                  audio.clearFailure();
                  onRetry();
                }}
                aria-label="Try again"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
              >
                <ArrowClockwise size={17} weight="bold" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => audio.skip(-LESSON_AUDIO_SKIP_SECONDS)}
                  disabled={!canPlay}
                  aria-label={`Back ${LESSON_AUDIO_SKIP_SECONDS} seconds`}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white cursor-pointer disabled:opacity-40 sm:flex"
                >
                  <ClockCounterClockwise size={17} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={audio.togglePlay}
                  disabled={!canPlay}
                  aria-label={audio.isPlaying ? "Pause" : "Play"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm transition-all hover:scale-105 hover:bg-white/20 active:scale-95 cursor-pointer disabled:cursor-default disabled:opacity-50 disabled:hover:scale-100"
                >
                  {audio.isBuffering && audio.isPlaying ? (
                    <CircleNotch size={17} className="animate-spin" />
                  ) : audio.isPlaying ? (
                    <Pause size={17} weight="fill" />
                  ) : (
                    <Play size={17} weight="fill" className="ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => audio.skip(LESSON_AUDIO_SKIP_SECONDS)}
                  disabled={!canPlay}
                  aria-label={`Forward ${LESSON_AUDIO_SKIP_SECONDS} seconds`}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white cursor-pointer disabled:opacity-40 sm:flex"
                >
                  <ClockClockwise size={17} weight="bold" />
                </button>
              </>
            )}
            <span
              className="ml-1.5 truncate text-[0.8rem] font-medium tabular-nums text-white/90"
              aria-live={statusText ? "polite" : undefined}
            >
              {statusText ??
                `${formatAudioTime(audio.currentTime)} / ${
                  audio.duration > 0 ? formatAudioTime(audio.duration) : "--:--"
                }`}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <AudioVolume audio={audio} />
            <button
              type="button"
              onClick={audio.cycleSpeed}
              aria-label={`Playback speed ${audio.playbackRate}x`}
              title="Playback speed"
              className="flex h-7 min-w-10 items-center justify-center rounded-[6px] border border-white/20 bg-white/10 px-2 text-[0.74rem] font-semibold tabular-nums text-white/90 transition-colors hover:bg-white/20 cursor-pointer"
            >
              {audio.playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A seek bar for `useLessonAudio`: drag, click, or arrow keys. */
export function AudioSeekBar({
  audio,
  disabled = false,
  className = "",
}: {
  audio: ReturnType<typeof useLessonAudio>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`group relative flex h-4 w-full items-center ${className}`}>
      <input
        type="range"
        min={0}
        max={audio.duration || 0}
        step={0.1}
        value={Math.min(audio.currentTime, audio.duration || 0)}
        disabled={disabled || audio.duration <= 0}
        onChange={(event) =>
          audio.seekTo(Number.parseFloat(event.target.value))
        }
        onPointerDown={() => audio.setScrubbing(true)}
        onPointerUp={() => audio.setScrubbing(false)}
        onKeyDown={(event) => {
          if (event.key === " ") {
            event.preventDefault();
            audio.togglePlay();
          }
        }}
        aria-label="Seek"
        aria-valuetext={`${formatAudioTime(audio.currentTime)} of ${formatAudioTime(audio.duration)}`}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
      <div className="relative h-1.5 w-full rounded-full bg-white/20 transition-all group-hover:h-2">
        <div
          style={{ width: `${audio.progressPercent}%` }}
          className="h-full rounded-full bg-(--accent) shadow-[0_0_8px_var(--accent)]"
        />
        <div
          style={{ left: `${audio.progressPercent}%` }}
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-125"
        />
      </div>
    </div>
  );
}

/** Mute and, where there is room, a volume slider. */
export function AudioVolume({
  audio,
}: {
  audio: ReturnType<typeof useLessonAudio>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={audio.toggleMute}
        aria-label={audio.isMuted ? "Unmute" : "Mute"}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
      >
        {audio.isMuted || audio.volume === 0 ? (
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
        value={audio.isMuted ? 0 : audio.volume}
        onChange={(event) =>
          audio.setVolume(Number.parseFloat(event.target.value))
        }
        aria-label="Volume"
        className="hidden h-1 w-16 cursor-pointer accent-(--accent) sm:block sm:w-20"
      />
    </div>
  );
}
