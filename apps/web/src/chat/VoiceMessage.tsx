import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { formatDuration } from "./chatFormat";

const SPEEDS = [1, 1.5, 2] as const;

/** Only one voice message plays at a time, as in WhatsApp. */
let playing: HTMLAudioElement | null = null;

/**
 * A voice message: play/pause, a waveform that fills as it plays (tap or
 * drag to seek), the time, and WhatsApp's 1× / 1.5× / 2× speed button.
 */
export function VoiceMessage({
  src,
  durationMs,
  waveform,
  outgoing,
}: {
  src: string;
  durationMs: number | null;
  waveform: number[] | null;
  outgoing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);
  const bars =
    waveform && waveform.length > 0
      ? waveform
      : Array.from({ length: 40 }, () => 30);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () =>
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const onEnd = () => {
      setIsPlaying(false);
      setProgress(0);
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      if (playing === audio) playing = null;
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (playing && playing !== audio) playing.pause();
      playing = audio;
      audio.playbackRate = speed;
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }

  function seek(event: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (event.clientX - box.left) / box.width),
    );
    audio.currentTime = fraction * audio.duration;
    setProgress(fraction);
  }

  function nextSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const shownSeconds =
    isPlaying || progress > 0 ? progress * duration : duration;

  return (
    <div className="flex w-64 max-w-full items-center gap-2.5 py-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--text-secondary) hover:text-(--text)"
      >
        {isPlaying ? (
          <Pause size={22} weight="fill" />
        ) : (
          <Play size={22} weight="fill" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seek(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) seek(event);
          }}
          onKeyDown={(event) => {
            const audio = audioRef.current;
            if (!audio || !audio.duration) return;
            if (event.key === "ArrowRight")
              audio.currentTime = Math.min(
                audio.duration,
                audio.currentTime + 5,
              );
            if (event.key === "ArrowLeft")
              audio.currentTime = Math.max(0, audio.currentTime - 5);
          }}
          className="flex h-7 cursor-pointer touch-none items-center gap-[2px]"
        >
          {bars.map((bar, index) => (
            <span
              key={index}
              className={cn(
                "w-[3px] shrink-0 rounded-full transition-colors",
                index / bars.length < progress
                  ? outgoing
                    ? "bg-(--accent-ink)"
                    : "bg-(--accent)"
                  : "bg-[color-mix(in_srgb,var(--text)_28%,transparent)]",
              )}
              style={{ height: `${Math.max(12, bar)}%` }}
            />
          ))}
        </div>
        <div className="mt-0.5 text-[0.7rem] text-(--muted) tabular-nums">
          {formatDuration(shownSeconds * 1000)}
        </div>
      </div>
      {isPlaying || progress > 0 ? (
        <button
          type="button"
          onClick={nextSpeed}
          aria-label={`Playback speed ${speed}×`}
          className="shrink-0 cursor-pointer rounded-full border-0 bg-[color-mix(in_srgb,var(--text)_14%,transparent)] px-2 py-0.5 text-[0.72rem] font-bold text-(--text)"
        >
          {speed}×
        </button>
      ) : null}
    </div>
  );
}
