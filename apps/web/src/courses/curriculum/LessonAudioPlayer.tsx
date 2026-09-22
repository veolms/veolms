import {
  DotsThreeIcon as DotsThree,
  HeadphonesIcon as Headphones,
  PauseIcon as Pause,
  PlayIcon as Play,
  SpeakerHighIcon as SpeakerHigh,
  SpeakerSlashIcon as SpeakerSlash,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface LessonAudioPlayerProps {
  title?: string;
  subtitle?: string;
  audioUrl?: string | null;
  durationSeconds?: number;
  thumbnailUrl?: string | null;
}

export function LessonAudioPlayer({
  title = "Introduction Audio",
  subtitle = "Web Development Course for Absolute Beginners",
  audioUrl,
  durationSeconds = 754, // 12:34 fallback default matching screenshot
  thumbnailUrl,
}: LessonAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);

  const effectiveDuration = durationSeconds > 0 ? durationSeconds : 754;

  const formatTime = (secs: number) => {
    const clamped = Math.max(0, Math.floor(secs));
    const m = Math.floor(clamped / 60);
    const s = clamped % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const togglePlay = useCallback(() => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        void audioRef.current.play();
      }
    } else {
      // Simulate playback for preview if no audio source provided
      setIsPlaying((prev) => !prev);
    }
  }, [isPlaying, audioUrl]);

  // Simulation timer if no real audio element
  useEffect(() => {
    if (!audioUrl && isPlaying) {
      const interval = window.setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= effectiveDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1 * playbackRate;
        });
      }, 1000);
      return () => window.clearInterval(interval);
    }
    return undefined;
  }, [audioUrl, isPlaying, effectiveDuration, playbackRate]);

  // Handle native audio events if audioUrl is present
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(audio.currentTime);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isScrubbing]);

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleCycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length] ?? 1;
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.muted = next;
      }
      return next;
    });
  };

  // Waveform heights for authentic audio visualizer animation
  const waveformBars = [
    12, 18, 28, 42, 35, 60, 48, 75, 90, 85, 95, 80, 68, 55, 78, 88, 70, 92, 64,
    45, 80, 65, 50, 40, 30, 20, 15,
  ];

  const progressPercent = Math.min(
    100,
    Math.max(0, (currentTime / effectiveDuration) * 100),
  );

  return (
    <div className="relative flex aspect-video w-full flex-col justify-between overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_22%,#050814)_0%,_#05070e_100%)] p-5 text-white shadow-(--card-shadow) sm:p-7 select-none">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
        />
      )}

      {/* Main Content Row: Album Art + Meta + Soundwave */}
      <div className="flex flex-1 items-center gap-5 sm:gap-7">
        {/* Album Artwork Card */}
        <div className="relative flex h-28 w-28 sm:h-36 sm:w-36 shrink-0 flex-col items-center justify-between overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_45%,#0c122c)_0%,_#0b0e1f_100%)] p-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Audio Album Art"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              {/* Glowing Headphones Artwork */}
              <div className="relative mt-2 flex items-center justify-center">
                <div className="absolute h-14 w-14 rounded-full bg-(--accent) opacity-35 blur-md" />
                <Headphones
                  size={38}
                  weight="fill"
                  className="relative text-(--accent)"
                />
              </div>

              {/* Album Art Soundwave Graphic */}
              <div className="flex h-3.5 items-end justify-center gap-[2.5px] opacity-80">
                {[8, 14, 20, 12, 18, 10, 16, 22, 12, 6].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}px` }}
                    className="w-[2px] rounded-full bg-(--accent)"
                  />
                ))}
              </div>

              {/* Album Title */}
              <div className="mt-auto">
                <p className="m-0 text-[0.58rem] sm:text-[0.62rem] font-bold tracking-[0.06em] text-white uppercase">
                  Web Development
                </p>
                <p className="m-0 text-[0.44rem] sm:text-[0.48rem] tracking-[0.1em] text-white/60 uppercase">
                  Learn • Practice • Grow
                </p>
              </div>
            </>
          )}
        </div>

        {/* Audio Meta and Animated Visualizer */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h3 className="m-0 truncate text-[1.15rem] sm:text-[1.38rem] font-bold tracking-[-0.015em] text-white">
            {title}
          </h3>
          <p className="m-0 mt-1 truncate text-[0.78rem] sm:text-[0.86rem] text-white/70">
            {subtitle}
          </p>

          {/* Soundwave Bars Visualizer */}
          <div className="mt-4 sm:mt-6 flex h-10 sm:h-12 items-center gap-[3px] sm:gap-1">
            {waveformBars.map((baseHeight, idx) => {
              const activeRatio = (idx / waveformBars.length) * 100;
              const isPast = activeRatio <= progressPercent;
              const dynamicHeight = isPlaying
                ? Math.max(12, Math.min(100, baseHeight + ((idx % 5) * 6 - 12)))
                : baseHeight;

              return (
                <div
                  key={idx}
                  style={{ height: `${dynamicHeight}%` }}
                  className={`w-[3px] sm:w-[4px] rounded-full transition-all duration-200 ${
                    isPast
                      ? "bg-[linear-gradient(180deg,#8b5cf6_0%,#3b82f6_100%)] shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                      : "bg-white/20 hover:bg-white/40"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Audio Scrubber and Controls Bar */}
      <div className="mt-3 flex flex-col gap-2">
        {/* Scrubber track */}
        <div
          ref={scrubberRef}
          className="group relative flex h-4 w-full cursor-pointer items-center"
        >
          <input
            type="range"
            min={0}
            max={effectiveDuration}
            value={currentTime}
            onChange={handleScrubberChange}
            onMouseDown={() => setIsScrubbing(true)}
            onMouseUp={() => setIsScrubbing(false)}
            aria-label="Audio scrubber"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 z-10"
          />
          {/* Track background */}
          <div className="relative h-1.5 w-full rounded-full bg-white/20 transition-all group-hover:h-2">
            {/* Progress fill */}
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full rounded-full bg-(--accent) shadow-[0_0_8px_var(--accent)]"
            />
            {/* Thumb */}
            <div
              style={{ left: `${progressPercent}%` }}
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-125"
            />
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between text-xs text-white/80">
          <div className="flex items-center gap-3">
            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm transition-all hover:scale-105 hover:bg-white/20 active:scale-95 cursor-pointer"
            >
              {isPlaying ? (
                <Pause size={17} weight="fill" />
              ) : (
                <Play size={17} weight="fill" className="ml-0.5" />
              )}
            </button>

            {/* Time Stamp */}
            <span className="text-[0.8rem] font-medium tabular-nums text-white/90">
              {formatTime(currentTime)} / {formatTime(effectiveDuration)}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Volume Control */}
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
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                  if (audioRef.current) {
                    audioRef.current.volume = val;
                    audioRef.current.muted = val === 0;
                  }
                }}
                aria-label="Volume slider"
                className="h-1 w-14 sm:w-18 cursor-pointer accent-(--accent)"
              />
            </div>

            {/* Playback Rate */}
            <button
              type="button"
              onClick={handleCycleSpeed}
              title="Playback speed"
              className="flex h-7 items-center justify-center rounded-[6px] border border-white/20 bg-white/10 px-2 text-[0.74rem] font-semibold text-white/90 hover:bg-white/20 transition-colors cursor-pointer"
            >
              {playbackRate}x
            </button>

            {/* More Options */}
            <button
              type="button"
              title="More options"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <DotsThree size={18} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
