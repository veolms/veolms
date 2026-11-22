import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import {
  setChatPrefs,
  useChatPrefs,
  VOICE_SPEEDS,
  type VoiceSpeed,
} from "../store/chatPrefs.store";
import { formatDuration } from "./chatFormat";
import { resolveMediaLength } from "./chatMedia";

/** Bars drawn: the stored waveform is averaged down to fit the bubble. */
const BAR_COUNT = 36;

/** A stored waveform that says nothing: missing, or one flat line. */
function isBlankWaveform(waveform: readonly number[] | null): boolean {
  if (!waveform || waveform.length === 0) return true;
  return Math.max(...waveform) - Math.min(...waveform) < 2;
}

/** Waveforms worked out from files, for this visit (by address). */
const decodedWaveforms = new Map<string, Promise<number[] | null>>();

/**
 * A voice message's waveform from its audio: the loudest sample in each of
 * `BAR_COUNT` slices, 0–100. For messages sent without one (every voice
 * message recorded on an iPhone before 22 Nov 2026 has a flat line).
 */
function waveformFromFile(
  src: string,
  readBlob: () => Promise<Blob>,
): Promise<number[] | null> {
  let pending = decodedWaveforms.get(src);
  if (!pending) {
    pending = (async () => {
      try {
        const bytes = await (await readBlob()).arrayBuffer();
        const Offline =
          window.OfflineAudioContext ??
          (
            window as unknown as {
              webkitOfflineAudioContext?: typeof OfflineAudioContext;
            }
          ).webkitOfflineAudioContext;
        if (!Offline) return null;
        const audio = await new Offline(1, 44100, 44100).decodeAudioData(bytes);
        const samples = audio.getChannelData(0);
        const slice = Math.max(1, Math.floor(samples.length / BAR_COUNT));
        const peaks: number[] = [];
        for (let bar = 0; bar < BAR_COUNT; bar += 1) {
          let peak = 0;
          const end = Math.min(samples.length, (bar + 1) * slice);
          for (let i = bar * slice; i < end; i += 1) {
            peak = Math.max(peak, Math.abs(samples[i]!));
          }
          peaks.push(peak);
        }
        const top = Math.max(...peaks);
        if (top <= 0) return null;
        return peaks.map((peak) => Math.max(4, Math.round((peak / top) * 100)));
      } catch {
        return null;
      }
    })();
    decodedWaveforms.set(src, pending);
  }
  return pending;
}

function fitBars(waveform: readonly number[] | null): number[] {
  if (!waveform || waveform.length === 0) {
    return Array.from({ length: BAR_COUNT }, () => 30);
  }
  if (waveform.length <= BAR_COUNT) return [...waveform];
  const step = waveform.length / BAR_COUNT;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    const slice = waveform.slice(from, to);
    return Math.max(...slice);
  });
}

/** Only one voice message plays at a time, as in WhatsApp. */
let playing: HTMLAudioElement | null = null;

/** How to start each voice message on the page, by its outer element. */
const starters = new WeakMap<Element, () => void>();

/**
 * WhatsApp: when a voice message ends and the very next message in the
 * chat is a voice message too, that one plays. Looked for in the same
 * chat (its scroller), by message order on the page.
 */
function playNextVoiceMessage(from: Element) {
  const row = from.closest('[id^="chat-message-"]');
  const thread = from.closest("[data-chat-thread]");
  if (!row || !thread) return;
  const rows = Array.from(thread.querySelectorAll('[id^="chat-message-"]'));
  const next = rows[rows.indexOf(row) + 1];
  const voice = next?.querySelector("[data-voice-message]");
  if (voice) starters.get(voice)?.();
}

/**
 * A voice message: play/pause, a waveform that fills as it plays (tap or
 * drag to seek), the time, and WhatsApp's 1× / 1.5× / 2× speed button.
 */
export function VoiceMessage({
  src,
  durationMs,
  waveform,
  outgoing,
  readBlob,
}: {
  src: string;
  durationMs: number | null;
  waveform: number[] | null;
  outgoing: boolean;
  /** The file's bytes, to work out a waveform when none was stored. */
  readBlob?: () => Promise<Blob>;
}) {
  const [decoded, setDecoded] = useState<number[] | null>(null);
  const blank = isBlankWaveform(waveform);
  useEffect(() => {
    if (!blank || !readBlob) return;
    let cancelled = false;
    void waveformFromFile(src, readBlob).then((bars) => {
      if (!cancelled && bars) setDecoded(bars);
    });
    return () => {
      cancelled = true;
    };
  }, [blank, readBlob, src]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const { voiceSpeed: speed } = useChatPrefs();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const speedRef = useRef<VoiceSpeed>(speed);
  speedRef.current = speed;
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const bars = fitBars(blank ? decoded : waveform);

  /**
   * The length to measure against. Recorded voice files (WebM) often tell
   * the browser their length is "Infinity" until played through, which
   * made the time read 0:00 while playing; the length saved at sending
   * time is used then.
   */
  function lengthOf(audio: HTMLAudioElement): number {
    return Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : durationRef.current;
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const length = lengthOf(audio);
      setElapsed(audio.currentTime);
      setProgress(length ? Math.min(1, audio.currentTime / length) : 0);
    };
    const onEnd = () => {
      setIsPlaying(false);
      setProgress(0);
      setElapsed(0);
      if (playing === audio) playing = null;
      if (rootRef.current) playNextVoiceMessage(rootRef.current);
    };
    let probed = false;
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (!probed && !durationRef.current && audio.paused) {
        // Sent without a length (an older upload) and a WebM that does
        // not say: find it, so the time reads right before playing.
        probed = true;
        void resolveMediaLength(audio).then((seconds) => {
          if (seconds > 0) setDuration(seconds);
        });
      }
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      if (playing === audio) playing = null;
    };
  }, []);

  function start() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    // Both: some browsers reset playbackRate when the file loads.
    audio.defaultPlaybackRate = speedRef.current;
    audio.playbackRate = speedRef.current;
    void audio.play().catch(() => setIsPlaying(false));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) start();
    else audio.pause();
  }

  // Lets the voice message above start this one when it ends.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    starters.set(element, start);
    return () => {
      starters.delete(element);
    };
  });

  function seek(event: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const length = audio ? lengthOf(audio) : 0;
    if (!audio || !length) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (event.clientX - box.left) / box.width),
    );
    audio.currentTime = fraction * length;
    setProgress(fraction);
    setElapsed(fraction * length);
  }

  function nextSpeed() {
    const next =
      VOICE_SPEEDS[(VOICE_SPEEDS.indexOf(speed) + 1) % VOICE_SPEEDS.length]!;
    // Kept on this device: every voice message plays at it from now on.
    setChatPrefs({ voiceSpeed: next });
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = next;
      audioRef.current.playbackRate = next;
    }
  }

  // WhatsApp: the length until played, then the time played so far.
  const shownSeconds = isPlaying || elapsed > 0 ? elapsed : duration;

  return (
    <div
      ref={rootRef}
      data-voice-message=""
      className="flex w-64 max-w-full min-w-0 items-center gap-2.5 py-1"
    >
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
            const length = audio ? lengthOf(audio) : 0;
            if (!audio || !length) return;
            if (event.key === "ArrowRight")
              audio.currentTime = Math.min(length, audio.currentTime + 5);
            if (event.key === "ArrowLeft")
              audio.currentTime = Math.max(0, audio.currentTime - 5);
          }}
          className="flex h-7 cursor-pointer touch-none items-center justify-between gap-[2px] overflow-hidden"
        >
          {bars.map((bar, index) => (
            <span
              key={index}
              className={cn(
                // Shrinks to fit: never wider than the bubble.
                "max-w-[3px] min-w-[1.5px] flex-1 rounded-full transition-colors",
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
