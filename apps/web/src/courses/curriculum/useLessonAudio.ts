import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const LESSON_AUDIO_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
/** How far the back and forward buttons skip, in seconds. */
export const LESSON_AUDIO_SKIP_SECONDS = 10;

export interface LessonAudioOptions {
  /** The file's address; null while it is being fetched. */
  audioUrl: string | null | undefined;
  /** Known length, shown until the file's own is read. */
  durationSeconds?: number;
  /** Where to start (a learner's saved place), in seconds. */
  initialTime?: number;
  /** Every second or so while it plays, and when it pauses. */
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  /**
   * What the phone's lock screen and the headphones' buttons name and
   * control (the Media Session), while this audio plays.
   */
  mediaSession?: { title: string; artist?: string } | null;
}

export interface LessonAudio {
  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  isBuffering: boolean;
  failed: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  canPlay: boolean;
  /** 0 to 100. */
  progressPercent: number;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  skip: (seconds: number) => void;
  cycleSpeed: () => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  /** While a seek bar is dragged, playback does not move its thumb. */
  setScrubbing: (scrubbing: boolean) => void;
  /** Forget a failure, to try the address again. */
  clearFailure: () => void;
}

/**
 * An audio lesson's playback in the page's own audio element: play and
 * pause, seeking and skipping, speed, volume, the learner's place, and the
 * device's media controls. Both the studio's preview and the lesson
 * player use it; each draws its own controls. Render
 * `<audio ref={audio.audioRef} src={audioUrl} preload="metadata" />`.
 */
export function useLessonAudio({
  audioUrl,
  durationSeconds = 0,
  initialTime = 0,
  onProgress,
  onEnded,
  mediaSession = null,
}: LessonAudioOptions): LessonAudio {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(durationSeconds);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const playbackRateRef = useRef(1);
  const isScrubbingRef = useRef(false);
  const lastReportRef = useRef(0);
  // A new address for the same file (one that expired) resumes in place.
  const resumeAtRef = useRef(initialTime);
  const durationRef = useRef(durationSeconds);
  durationRef.current = duration;

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
    if (!audio || !audioUrl) return undefined;

    const report = (force: boolean) => {
      const now = audio.currentTime;
      if (!force && Math.abs(now - lastReportRef.current) < 1) return;
      lastReportRef.current = now;
      onProgressRef.current?.(now, audio.duration || durationRef.current);
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

    const listeners: [string, () => void][] = [
      ["loadedmetadata", handleLoadedMetadata],
      ["timeupdate", handleTimeUpdate],
      ["play", handlePlay],
      ["pause", handlePause],
      ["waiting", handleWaiting],
      ["playing", handlePlaying],
      ["canplay", handlePlaying],
      ["ended", handleEnded],
      ["error", handleError],
    ];
    for (const [event, listener] of listeners) {
      audio.addEventListener(event, listener);
    }
    return () => {
      for (const [event, listener] of listeners) {
        audio.removeEventListener(event, listener);
      }
    };
  }, [audioUrl]);

  const canPlay = Boolean(audioUrl) && !failed;

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [canPlay]);

  const seekTo = useCallback((seconds: number) => {
    const known = durationRef.current;
    const clamped = Math.max(0, known > 0 ? Math.min(seconds, known) : seconds);
    setCurrentTime(clamped);
    resumeAtRef.current = clamped;
    if (audioRef.current) audioRef.current.currentTime = clamped;
  }, []);

  const skip = useCallback(
    (seconds: number) =>
      seekTo((audioRef.current?.currentTime ?? resumeAtRef.current) + seconds),
    [seekTo],
  );

  const cycleSpeed = useCallback(() => {
    const index = LESSON_AUDIO_SPEEDS.indexOf(
      playbackRateRef.current as (typeof LESSON_AUDIO_SPEEDS)[number],
    );
    const next =
      LESSON_AUDIO_SPEEDS[(index + 1) % LESSON_AUDIO_SPEEDS.length] ?? 1;
    playbackRateRef.current = next;
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    setIsMuted(value === 0);
    if (audioRef.current) {
      audioRef.current.volume = value;
      audioRef.current.muted = value === 0;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((muted) => {
      if (audioRef.current) audioRef.current.muted = !muted;
      return !muted;
    });
  }, []);

  // The lock screen and headphones control the audio while it plays.
  const sessionTitle = mediaSession?.title;
  const sessionArtist = mediaSession?.artist;
  useEffect(() => {
    if (
      !sessionTitle ||
      !isPlaying ||
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      typeof MediaMetadata === "undefined"
    ) {
      return undefined;
    }
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: sessionTitle,
      artist: sessionArtist ?? "",
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void audioRef.current?.play().catch(() => undefined)],
      ["pause", () => audioRef.current?.pause()],
      ["seekbackward", () => skip(-LESSON_AUDIO_SKIP_SECONDS)],
      ["seekforward", () => skip(LESSON_AUDIO_SKIP_SECONDS)],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") seekTo(details.seekTime);
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // A browser without this action leaves it to its own controls.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Nothing was set.
        }
      }
    };
  }, [isPlaying, seekTo, sessionArtist, sessionTitle, skip]);

  return {
    audioRef,
    isPlaying,
    isBuffering,
    failed,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    canPlay,
    progressPercent:
      duration > 0
        ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
        : 0,
    togglePlay,
    seekTo,
    skip,
    cycleSpeed,
    setVolume,
    toggleMute,
    setScrubbing: (scrubbing) => {
      isScrubbingRef.current = scrubbing;
    },
    clearFailure: () => setFailed(false),
  };
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatAudioTime(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : `${minutes}:${secs.toString().padStart(2, "0")}`;
}
