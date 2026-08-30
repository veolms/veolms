import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ClosedCaptioningIcon as ClosedCaptioning } from "@phosphor-icons/react/ClosedCaptioning";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/Gauge";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/Monitor";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PictureInPictureIcon as PictureInPicture } from "@phosphor-icons/react/PictureInPicture";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { RectangleIcon as Rectangle } from "@phosphor-icons/react/Rectangle";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { SpeakerHighIcon as SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { AppSlider } from "./AppSlider";
import {
  getDocumentFullscreenElement,
  lockScreenOrientation,
  unlockScreenOrientation,
} from "./fullscreen";
import { isEditingShortcutTarget } from "./keyboardShortcuts";
import type { CourseVideo } from "./learning/courseContent";

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
const RESUME_PERSIST_INTERVAL_MS = 5_000;
const AMBIENT_FRAME_INTERVAL_MS = 480;
const PLAYER_MUTED_STORAGE_KEY = "veolms-player-muted";
const PLAYER_INTERACTIVE_SHORTCUT_SELECTOR =
  "button, a[href], input, textarea, select, [role='button'], [role='tab'], [role='option'], [role='radio'], [role='checkbox'], [role='listbox'], [tabindex]:not([tabindex='-1'])";

const getInitialMuted = () => {
  if (typeof window === "undefined") return false;
  try {
    const savedPreference = window.localStorage.getItem(
      PLAYER_MUTED_STORAGE_KEY,
    );
    return savedPreference === "true" || savedPreference === "on";
  } catch {
    return false;
  }
};

const getAmbientDefault = () => {
  if (typeof window === "undefined") return false;

  try {
    const savedPreference = window.localStorage.getItem(
      "veolms-player-ambient",
    );
    if (savedPreference === "on") return true;
    if (savedPreference === "off") return false;
  } catch {
    // Fall through to a device-sensitive default.
  }

  const constrainedDevice = window.matchMedia?.(
    "(prefers-reduced-motion: reduce), (pointer: coarse)",
  );
  return !constrainedDevice?.matches;
};

const formatMediaTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours)
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

interface SwitchVisualProps {
  checked: boolean;
}

function SwitchVisual({ checked }: SwitchVisualProps) {
  return (
    <span
      aria-hidden="true"
      className={`player-switch ${checked ? "player-switch--on" : ""}`}
    >
      <span className="player-switch-thumb" />
    </span>
  );
}

interface VideoPlayerProps {
  media: CourseVideo;
  lessonTitle: string;
  theaterMode: boolean;
  onTheaterToggle: () => void;
  autoPlayOnMediaChange?: boolean;
  onProgressChange?: (progress: number) => void;
  resumePersistenceKey?: string;
}

export function VideoPlayer({
  media,
  lessonTitle,
  theaterMode,
  onTheaterToggle,
  autoPlayOnMediaChange = false,
  onProgressChange,
  resumePersistenceKey,
}: VideoPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const ambientShellCanvasRef = useRef<HTMLCanvasElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const suppressNextPlayerActionRef = useRef(false);
  const controlsTimerRef = useRef<number | undefined>(undefined);
  const hudTimerRef = useRef<number | undefined>(undefined);
  const lastResumePersistedAtRef = useRef<number | null>(null);
  const lastKnownPlaybackTimeRef = useRef(0);
  const shortcutHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const shortcutUpHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const blurHandlerRef = useRef<() => void>(() => {});
  const lastClickTimeRef = useRef(0);
  const wasPausedBeforeSpeedBoostRef = useRef(false);
  const longPressTimerRef = useRef<number | undefined>(undefined);
  const orientationLockRequestedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mutedPreferenceReady, setMutedPreferenceReady] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(media.duration);
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<"main" | "speed">("main");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hud, setHud] = useState("");
  const [mediaError, setMediaError] = useState(false);
  // The server cannot read the saved device preference. Start from the same
  // deterministic value on both sides, then restore it after hydration.
  const [ambient, setAmbient] = useState(false);
  const [ambientPortalHost, setAmbientPortalHost] =
    useState<HTMLElement | null>(null);
  const [tempSpeedActive, setTempSpeedActive] = useState(false);
  const resumeStorageKey = `veolms-watch-${resumePersistenceKey ?? media.fileName}`;

  const showHud = (message: string) => {
    window.clearTimeout(hudTimerRef.current);
    setHud(message);
    hudTimerRef.current = window.setTimeout(() => setHud(""), 1100);
  };

  const consumeDismissedAction = () => {
    if (!suppressNextPlayerActionRef.current) return false;
    suppressNextPlayerActionRef.current = false;
    return true;
  };

  const runPlayerAction = (action: () => void | Promise<void>) => {
    if (consumeDismissedAction()) return;
    action();
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
      setMediaError(false);
    } catch {
      setMediaError(true);
    }
  };

  const reportProgress = (position: number, mediaDuration: number) => {
    const nextProgress = mediaDuration
      ? Math.max(0, Math.min(100, (position / mediaDuration) * 100))
      : 0;
    onProgressChange?.(nextProgress);
    return nextProgress;
  };

  const skip = (amount: number, announce = true) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.max(
      0,
      Math.min(video.duration || duration, video.currentTime + amount),
    );
    video.currentTime = nextTime;
    lastKnownPlaybackTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    setProgress(reportProgress(nextTime, video.duration || duration));
    if (announce)
      showHud(`${amount > 0 ? "+" : "−"}${Math.abs(amount)} seconds`);
  };

  const seekToProgress = (next: number) => {
    const safeProgress = Math.max(0, Math.min(100, next));
    setProgress(safeProgress);
    onProgressChange?.(safeProgress);
    if (videoRef.current?.duration) {
      const nextTime = (safeProgress / 100) * videoRef.current.duration;
      videoRef.current.currentTime = nextTime;
      lastKnownPlaybackTimeRef.current = nextTime;
      setCurrentTime(nextTime);
    }
  };

  const setPlaybackSpeed = (next: number, announce = true) => {
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    if (announce) showHud(`${next}×`);
  };

  const adjustSpeed = (direction: number) => {
    const currentIndex = playbackSpeeds.indexOf(speed);
    const safeIndex =
      currentIndex < 0 ? playbackSpeeds.indexOf(1) : currentIndex;
    const nextIndex = Math.max(
      0,
      Math.min(playbackSpeeds.length - 1, safeIndex + direction),
    );
    setPlaybackSpeed(playbackSpeeds[nextIndex]!);
  };

  const toggleCaptions = () => {
    const next = !captions;
    setCaptions(next);
    const captionsTrack = videoRef.current?.textTracks?.[0];
    if (captionsTrack) captionsTrack.mode = next ? "showing" : "hidden";
    showHud(next ? "Captions on" : "Captions off");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
    showHud(next ? "Muted" : "Sound on");
  };

  const changeVolume = (next: number) => {
    setVolume(next);
    setMuted(next === 0);
    if (videoRef.current) {
      videoRef.current.volume = next;
      videoRef.current.muted = next === 0;
    }
  };

  const requestPip = async () => {
    if (!document.pictureInPictureEnabled || !videoRef.current) return;
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else await videoRef.current.requestPictureInPicture();
    } catch {
      showHud("Picture-in-picture unavailable");
    }
  };

  const isPortraitViewport = () => {
    const orientationType = window.screen?.orientation?.type;
    return orientationType
      ? orientationType.startsWith("portrait")
      : window.innerHeight > window.innerWidth;
  };

  const requestFullscreen = async () => {
    if (getDocumentFullscreenElement()) {
      orientationLockRequestedRef.current = false;
      unlockScreenOrientation();
      await document.exitFullscreen?.();
      return;
    }

    const shell = shellRef.current;
    if (!shell?.requestFullscreen) return;

    const shouldLockLandscape = isPortraitViewport();
    await shell.requestFullscreen();

    if (shouldLockLandscape) {
      const locked = await lockScreenOrientation();
      if (!getDocumentFullscreenElement()) {
        if (locked) unlockScreenOrientation();
        return;
      }
      orientationLockRequestedRef.current = locked;
    }
  };

  const persistResumePosition = useCallback(
    (position = lastKnownPlaybackTimeRef.current, force = false) => {
      if (!Number.isFinite(position) || position <= 0) return;

      const now = Date.now();
      if (
        !force &&
        lastResumePersistedAtRef.current !== null &&
        now - lastResumePersistedAtRef.current < RESUME_PERSIST_INTERVAL_MS
      )
        return;

      try {
        window.localStorage.setItem(resumeStorageKey, String(position));
        lastResumePersistedAtRef.current = now;
      } catch {
        // Playback should remain available when browser storage is unavailable.
      }
    },
    [resumeStorageKey],
  );

  const paintAmbientFrame = useCallback(() => {
    const video = videoRef.current;
    if (!ambient || !video || video.readyState < 2) return;
    try {
      for (const canvas of [
        ambientCanvasRef.current,
        ambientShellCanvasRef.current,
      ]) {
        if (!canvas) continue;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) continue;
        if (canvas.width !== 96) canvas.width = 96;
        if (canvas.height !== 54) canvas.height = 54;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    } catch {
      // Playback remains available when a cross-origin media response cannot be drawn to canvas.
    }
  }, [ambient]);

  const scheduleControlsHide = () => {
    window.clearTimeout(controlsTimerRef.current);
    setControlsVisible(true);
    if (playing && !settingsOpen) {
      controlsTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        2200,
      );
    }
  };

  const handleFramePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (settingsOpen) {
      const target = event.target;
      if (
        settingsMenuRef.current?.contains(target as Node) ||
        settingsButtonRef.current?.contains(target as Node)
      )
        return;
      suppressNextPlayerActionRef.current = true;
      setSettingsOpen(false);
      setSettingsPage("main");
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest("[data-player-control], [data-player-menu], input")
    )
      return;

    const now = Date.now();
    if (now - lastClickTimeRef.current < 400) {
      setTempSpeedActive(true);
      wasPausedBeforeSpeedBoostRef.current = videoRef.current?.paused ?? false;
      if (videoRef.current?.paused) {
        void videoRef.current.play().catch(() => {});
      }
    } else {
      longPressTimerRef.current = window.setTimeout(() => {
        setTempSpeedActive(true);
        wasPausedBeforeSpeedBoostRef.current =
          videoRef.current?.paused ?? false;
        if (videoRef.current?.paused) {
          void videoRef.current.play().catch(() => {});
        }
      }, 500);
    }
    lastClickTimeRef.current = now;
  };

  const clearTempSpeed = () => {
    window.clearTimeout(longPressTimerRef.current);
    if (tempSpeedActive) {
      setTempSpeedActive(false);
      if (wasPausedBeforeSpeedBoostRef.current) {
        videoRef.current?.pause();
      }
      suppressNextPlayerActionRef.current = true;
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    video.pause();
    video.load();
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(media.duration);
    setMediaError(false);
    setControlsVisible(true);
    lastKnownPlaybackTimeRef.current = 0;
    lastResumePersistedAtRef.current = null;

    if (autoPlayOnMediaChange) {
      void video.play().catch(() => {
        if (!active) return;
        setPlaying(false);
        setControlsVisible(true);
      });
    }

    return () => {
      active = false;
    };
  }, [autoPlayOnMediaChange, media.duration, media.src, onProgressChange]);

  useEffect(() => {
    if (videoRef.current)
      videoRef.current.playbackRate = tempSpeedActive ? 2 : speed;
  }, [speed, tempSpeedActive]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    setMuted(getInitialMuted());
    setMutedPreferenceReady(true);
  }, []);

  useEffect(() => {
    const unlockOrientationAfterExit = () => {
      if (getDocumentFullscreenElement()) return;
      if (!orientationLockRequestedRef.current) return;
      orientationLockRequestedRef.current = false;
      unlockScreenOrientation();
    };

    document.addEventListener("fullscreenchange", unlockOrientationAfterExit);
    document.addEventListener(
      "webkitfullscreenchange",
      unlockOrientationAfterExit,
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        unlockOrientationAfterExit,
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        unlockOrientationAfterExit,
      );
      if (orientationLockRequestedRef.current) {
        orientationLockRequestedRef.current = false;
        unlockScreenOrientation();
      }
    };
  }, []);

  useEffect(() => {
    if (!mutedPreferenceReady) return;
    if (videoRef.current) videoRef.current.muted = muted;
    try {
      window.localStorage.setItem(PLAYER_MUTED_STORAGE_KEY, String(muted));
    } catch {
      // Playback controls should remain available when browser storage is unavailable.
    }
  }, [muted, mutedPreferenceReady]);

  useEffect(() => {
    const syncMutedPreference = (event: StorageEvent) => {
      if (event.key !== PLAYER_MUTED_STORAGE_KEY) return;
      setMuted(event.newValue === "true" || event.newValue === "on");
    };
    window.addEventListener("storage", syncMutedPreference);
    return () => window.removeEventListener("storage", syncMutedPreference);
  }, []);

  useEffect(() => {
    setAmbient(getAmbientDefault());
  }, []);

  useEffect(() => {
    setAmbientPortalHost(
      shellRef.current?.closest<HTMLElement>(".courses-app") ?? null,
    );
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = ambientShellCanvasRef.current;
    if (!ambientPortalHost || !shell || !canvas) return undefined;

    let animationFrame = 0;
    const syncProjectionBounds = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const bounds = shell.getBoundingClientRect();
        canvas.style.left = `${bounds.left}px`;
        canvas.style.top = `${bounds.top}px`;
        canvas.style.width = `${bounds.width}px`;
        canvas.style.height = `${bounds.height}px`;
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncProjectionBounds);
    const scrollport = shell.closest(".courses-main");

    resizeObserver?.observe(shell);
    scrollport?.addEventListener("scroll", syncProjectionBounds, {
      passive: true,
    });
    window.addEventListener("resize", syncProjectionBounds, { passive: true });
    window.visualViewport?.addEventListener("resize", syncProjectionBounds);
    syncProjectionBounds();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      scrollport?.removeEventListener("scroll", syncProjectionBounds);
      window.removeEventListener("resize", syncProjectionBounds);
      window.visualViewport?.removeEventListener(
        "resize",
        syncProjectionBounds,
      );
    };
  }, [ambientPortalHost, theaterMode]);

  useEffect(
    () => () => {
      persistResumePosition(undefined, true);
    },
    [persistResumePosition],
  );

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        settingsMenuRef.current?.contains(event.target as Node) ||
        settingsButtonRef.current?.contains(event.target as Node)
      )
        return;
      setSettingsOpen(false);
      setSettingsPage("main");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setSettingsPage("main");
      settingsButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  useEffect(() => {
    window.clearTimeout(controlsTimerRef.current);
    if (playing && !settingsOpen)
      controlsTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        2200,
      );
    else setControlsVisible(true);
    return () => window.clearTimeout(controlsTimerRef.current);
  }, [playing, settingsOpen]);

  useEffect(() => {
    if (!ambient) return undefined;
    paintAmbientFrame();
    if (!playing) return undefined;
    let animationFrame: number;
    let lastPaint = 0;
    const draw = (time: number) => {
      if (time - lastPaint > AMBIENT_FRAME_INTERVAL_MS) {
        paintAmbientFrame();
        lastPaint = time;
      }
      animationFrame = window.requestAnimationFrame(draw);
    };
    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [ambient, ambientPortalHost, paintAmbientFrame, playing]);

  useEffect(
    () => () => {
      window.clearTimeout(controlsTimerRef.current);
      window.clearTimeout(hudTimerRef.current);
    },
    [],
  );

  const controlsAreVisible = controlsVisible || !playing || settingsOpen;

  const handlePlayerKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      isEditingShortcutTarget(event.target)
    )
      return;

    const focusedInteractiveControl =
      event.target instanceof Element
        ? event.target.closest(PLAYER_INTERACTIVE_SHORTCUT_SELECTOR)
        : null;
    if (
      focusedInteractiveControl &&
      focusedInteractiveControl !== frameRef.current
    )
      return;

    const isPercentageSeekShortcut =
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      /^Digit[0-9]$/.test(event.code);
    if (isPercentageSeekShortcut) {
      event.preventDefault();
      seekToProgress(Number(event.code.slice(-1)) * 10);
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const focusedControl =
      event.target instanceof Element
        ? event.target.closest('[role="slider"], [role="separator"]')
        : null;
    if (
      focusedControl &&
      (event.code === "ArrowLeft" ||
        event.code === "ArrowRight" ||
        event.code === "Home" ||
        event.code === "End")
    )
      return;

    const speedDown =
      event.shiftKey &&
      (event.code === "Comma" ||
        event.code === "ArrowLeft" ||
        event.key === "<");
    const speedUp =
      event.shiftKey &&
      (event.code === "Period" ||
        event.code === "ArrowRight" ||
        event.key === ">");
    if (speedDown || speedUp) {
      event.preventDefault();
      adjustSpeed(speedUp ? 1 : -1);
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (event.repeat) {
        if (!tempSpeedActive) {
          setTempSpeedActive(true);
          wasPausedBeforeSpeedBoostRef.current =
            videoRef.current?.paused ?? false;
          if (videoRef.current?.paused) {
            void videoRef.current.play().catch(() => {});
          }
        }
      }
    } else if (key === "k") {
      event.preventDefault();
      void togglePlay();
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      skip(-5);
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      skip(5);
    } else if (key === "j") {
      event.preventDefault();
      skip(-10);
    } else if (key === "l") {
      event.preventDefault();
      skip(10);
    } else if (key === "m") {
      event.preventDefault();
      toggleMute();
    } else if (key === "c") {
      event.preventDefault();
      toggleCaptions();
    } else if (key === "f") {
      event.preventDefault();
      void requestFullscreen();
    } else if (key === "t") {
      event.preventDefault();
      onTheaterToggle();
    } else if (key === "i") {
      event.preventDefault();
      void requestPip();
    } else if (event.code === "Home") {
      event.preventDefault();
      seekToProgress(0);
    } else if (event.code === "End") {
      event.preventDefault();
      seekToProgress(100);
    }
  };
  shortcutHandlerRef.current = handlePlayerKeyDown;

  const handlePlayerKeyUp = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      isEditingShortcutTarget(event.target)
    )
      return;

    const focusedInteractiveControl =
      event.target instanceof Element
        ? event.target.closest(PLAYER_INTERACTIVE_SHORTCUT_SELECTOR)
        : null;
    if (
      focusedInteractiveControl &&
      focusedInteractiveControl !== frameRef.current
    )
      return;

    if (event.code === "Space") {
      event.preventDefault();
      if (tempSpeedActive) {
        clearTempSpeed();
      } else {
        // Only toggle play if it wasn't a long press
        void togglePlay();
      }
    }
  };
  shortcutUpHandlerRef.current = handlePlayerKeyUp;

  blurHandlerRef.current = clearTempSpeed;

  useEffect(() => {
    const handlePageKeyDown = (event: KeyboardEvent) => {
      shortcutHandlerRef.current(event);
    };
    const handlePageKeyUp = (event: KeyboardEvent) => {
      shortcutUpHandlerRef.current(event);
    };
    const handleBlur = () => {
      blurHandlerRef.current();
    };
    window.addEventListener("keydown", handlePageKeyDown, true);
    window.addEventListener("keyup", handlePageKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handlePageKeyDown, true);
      window.removeEventListener("keyup", handlePageKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className={`video-shell relative isolate ${theaterMode ? "video-shell--theater" : ""}`}
    >
      {ambientPortalHost
        ? createPortal(
            <canvas
              ref={ambientShellCanvasRef}
              aria-hidden="true"
              data-ambient-shell-projection
              className={`ambient-canvas ambient-canvas--shell ${ambient && !mediaError ? "ambient-canvas--visible" : ""}`}
            />,
            ambientPortalHost,
          )
        : null}
      <canvas
        ref={ambientCanvasRef}
        aria-hidden="true"
        className={`ambient-canvas ${ambient && !mediaError ? "ambient-canvas--visible" : ""}`}
      />
      <section
        ref={frameRef}
        role="region"
        aria-label={`Lesson video player for ${lessonTitle}`}
        data-playing={playing ? "true" : "false"}
        tabIndex={0}
        onPointerDownCapture={handleFramePointerDown}
        onPointerUpCapture={clearTempSpeed}
        onPointerCancelCapture={clearTempSpeed}
        onPointerLeave={clearTempSpeed}
        onMouseMove={scheduleControlsHide}
        onMouseLeave={() =>
          playing && !settingsOpen && setControlsVisible(false)
        }
        onFocusCapture={() => setControlsVisible(true)}
        onClick={(event) => {
          if (
            (event.target as Element).closest(
              "[data-player-control], [data-player-menu], input",
            )
          )
            return;
          event.currentTarget.focus({ preventScroll: true });
          runPlayerAction(togglePlay);
        }}
        className={`youtube-player group relative z-10 w-full overflow-hidden rounded-[13px] border-0 bg-black shadow-[0_18px_50px_rgba(0,0,0,.2)] focus-visible:outline-4 focus-visible:outline-(--accent) focus-visible:outline-offset-2 ${theaterMode ? "lg:h-[calc(100vh-94px)] lg:min-h-105" : ""} ${playing && !controlsAreVisible ? "cursor-none" : ""}`}
      >
        <video
          ref={videoRef}
          className="size-full object-contain"
          preload="auto"
          src={media.src}
          muted={muted}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration);
            let savedTime = 0;
            try {
              savedTime = Number(localStorage.getItem(resumeStorageKey));
            } catch {
              // Resume from the beginning when browser storage is unavailable.
            }
            event.currentTarget.currentTime =
              Number.isFinite(savedTime) && savedTime > 0
                ? Math.min(
                    savedTime,
                    Math.max(0, event.currentTarget.duration - 1),
                  )
                : Math.min(0.01, event.currentTarget.duration || 0);
            lastKnownPlaybackTimeRef.current = event.currentTarget.currentTime;
            setCurrentTime(event.currentTarget.currentTime);
            setProgress(
              reportProgress(
                event.currentTarget.currentTime,
                event.currentTarget.duration,
              ),
            );
            event.currentTarget.playbackRate = tempSpeedActive ? 2 : speed;
            event.currentTarget.volume = volume;
          }}
          onLoadedData={paintAmbientFrame}
          onSeeked={paintAmbientFrame}
          onCanPlay={() => setMediaError(false)}
          onPlay={() => {
            setPlaying(true);
            setControlsVisible(true);
          }}
          onPause={(event) => {
            lastKnownPlaybackTimeRef.current = event.currentTarget.currentTime;
            persistResumePosition(event.currentTarget.currentTime, true);
            setPlaying(false);
            setControlsVisible(true);
          }}
          onTimeUpdate={(event) => {
            const nextTime = event.currentTarget.currentTime;
            const nextDuration = event.currentTarget.duration;
            setCurrentTime(nextTime);
            setProgress(reportProgress(nextTime, nextDuration));
            lastKnownPlaybackTimeRef.current = nextTime;
            persistResumePosition(nextTime);
          }}
          onError={() => setMediaError(true)}
          onEnded={(event) => {
            lastKnownPlaybackTimeRef.current = event.currentTarget.currentTime;
            persistResumePosition(event.currentTarget.currentTime, true);
            setProgress(100);
            onProgressChange?.(100);
            setPlaying(false);
          }}
        >
          <track
            kind="captions"
            src="/assets/designing-users.vtt"
            srcLang="en"
            label="English"
          />
        </video>

        {mediaError && (
          <div
            role="alert"
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 px-6 text-center text-sm text-white"
          >
            This lesson video could not be loaded. Check your connection, then
            try again.
          </div>
        )}

        {(hud || tempSpeedActive) && (
          <div role="status" className="player-hud">
            {tempSpeedActive ? "2× ▶▶" : hud}
          </div>
        )}

        <button
          type="button"
          data-player-control
          aria-label={playing ? "Pause video" : "Play video"}
          aria-hidden={playing}
          tabIndex={playing ? -1 : 0}
          onClick={() => {
            frameRef.current?.focus({ preventScroll: true });
            runPlayerAction(togglePlay);
          }}
          className={`absolute left-1/2 top-1/2 z-10 flex size-17 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-2xl transition duration-200 hover:bg-black/80 focus-visible:outline-4 focus-visible:outline-white/80 ${playing ? "pointer-events-none scale-90 opacity-0" : "opacity-100"}`}
        >
          <Play size={34} weight="fill" className="translate-x-0.5" />
        </button>

        <div
          className={`player-chrome ${controlsAreVisible ? "player-chrome--visible" : ""}`}
        >
          <div className="absolute inset-x-3 bottom-3 z-20 text-white sm:inset-x-4">
            <label className="relative block h-5" aria-label="Video position">
              <AppSlider
                min="0"
                max="100"
                step="0.1"
                value={Number.isFinite(progress) ? progress : 0}
                variant="player"
                aria-label="Video position"
                aria-valuetext={`${formatMediaTime(currentTime)} of ${formatMediaTime(duration)}`}
                onInput={(event) =>
                  seekToProgress(Number(event.currentTarget.value))
                }
                onChange={(event) =>
                  seekToProgress(Number(event.currentTarget.value))
                }
                className="video-scrubber absolute inset-0 w-full"
              />
            </label>

            <div className="mt-2 flex h-9 items-center gap-1 sm:gap-2">
              <button
                data-player-control
                type="button"
                title={playing ? "Pause (k)" : "Play (k)"}
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => runPlayerAction(togglePlay)}
                className="player-control"
              >
                {playing ? (
                  <Pause size={25} weight="fill" />
                ) : (
                  <Play size={25} weight="fill" />
                )}
              </button>

              <div className="player-volume-group flex items-center">
                <button
                  data-player-control
                  type="button"
                  title={muted ? "Unmute (m)" : "Mute (m)"}
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={() => runPlayerAction(toggleMute)}
                  className="player-control"
                >
                  {muted || volume === 0 ? (
                    <SpeakerSlash size={25} />
                  ) : (
                    <SpeakerHigh size={25} />
                  )}
                </button>
                <AppSlider
                  data-player-control
                  aria-label="Volume"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  variant="volume"
                  aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
                  onInput={(event) =>
                    changeVolume(Number(event.currentTarget.value))
                  }
                  onChange={(event) =>
                    changeVolume(Number(event.currentTarget.value))
                  }
                  className="player-volume-slider"
                />
              </div>

              <span className="ml-0.5 whitespace-nowrap text-xs text-white/85 sm:text-sm">
                {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
              </span>
              <span className="flex-1" />

              <button
                data-player-control
                type="button"
                title="Subtitles/closed captions (c)"
                aria-label="Toggle captions"
                aria-pressed={captions}
                onClick={() => runPlayerAction(toggleCaptions)}
                className={`player-control ${captions ? "bg-white text-black" : ""}`}
              >
                <ClosedCaptioning size={26} />
              </button>

              <div className="relative">
                <button
                  ref={settingsButtonRef}
                  data-player-control
                  data-settings-button
                  type="button"
                  title="Settings"
                  aria-label="Player settings"
                  aria-expanded={settingsOpen}
                  onClick={() => {
                    setSettingsPage("main");
                    setSettingsOpen((open) => !open);
                  }}
                  className={`player-control ${settingsOpen ? "bg-white/15" : ""}`}
                >
                  <GearSix size={25} />
                </button>

                {settingsOpen && (
                  <div
                    ref={settingsMenuRef}
                    data-player-menu
                    data-control-radius-menu
                    role="group"
                    aria-label={
                      settingsPage === "speed"
                        ? "Playback speed"
                        : "Player settings"
                    }
                    className="player-menu absolute bottom-12 right-0 w-64 rounded-xl border border-white/15 bg-[#0b0b0b]/90 p-2 text-sm text-white shadow-[0_18px_48px_rgba(0,0,0,.42)] backdrop-blur-[2px]"
                  >
                    {settingsPage === "main" ? (
                      <>
                        <button
                          type="button"
                          aria-pressed={ambient}
                          onClick={() =>
                            setAmbient((current) => {
                              const next = !current;
                              try {
                                localStorage.setItem(
                                  "veolms-player-ambient",
                                  next ? "on" : "off",
                                );
                              } catch {
                                // Ambient mode remains available when browser storage is unavailable.
                              }
                              return next;
                            })
                          }
                          className="player-menu-row"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Sparkle size={21} />
                            <span>Ambient mode</span>
                          </span>
                          <SwitchVisual checked={ambient} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettingsPage("speed")}
                          className="player-menu-row"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Gauge size={21} />
                            <span>Playback speed</span>
                          </span>
                          <span className="flex items-center gap-1 text-white/65">
                            {speed}x <CaretRight size={16} />
                          </span>
                        </button>
                        <div
                          className="player-menu-row"
                          aria-label="Quality: Auto"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Monitor size={21} />
                            <span>Quality</span>
                          </span>
                          <span className="text-white/65">Auto</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setSettingsPage("main")}
                          className="player-menu-row justify-start gap-3 border-b border-white/10"
                        >
                          <CaretLeft size={18} />
                          <span className="font-semibold">Playback speed</span>
                        </button>
                        {playbackSpeeds.map((item) => (
                          <button
                            type="button"
                            aria-pressed={speed === item}
                            key={item}
                            onClick={() => {
                              setPlaybackSpeed(item);
                              setSettingsOpen(false);
                              setSettingsPage("main");
                            }}
                            className={`player-menu-row ${speed === item ? "bg-white/10" : ""}`}
                          >
                            <span>{item === 1 ? "Normal" : `${item}x`}</span>
                            {speed === item && (
                              <Check size={16} weight="bold" />
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                data-player-control
                type="button"
                title="Picture in picture (i)"
                aria-label="Picture in picture"
                onClick={() => runPlayerAction(requestPip)}
                className="player-control player-secondary-control"
              >
                <PictureInPicture size={25} />
              </button>
              <button
                data-player-control
                type="button"
                title={`${theaterMode ? "Default view" : "Theater mode"} (t)`}
                aria-label={
                  theaterMode ? "Exit theater mode" : "Enter theater mode"
                }
                aria-pressed={theaterMode}
                onClick={() => runPlayerAction(onTheaterToggle)}
                className={`player-control player-secondary-control ${theaterMode ? "bg-white text-black" : ""}`}
              >
                <Rectangle
                  size={24}
                  weight={theaterMode ? "fill" : "regular"}
                />
              </button>
              <button
                data-player-control
                type="button"
                title="Fullscreen (f)"
                aria-label="Toggle fullscreen"
                onClick={() => runPlayerAction(requestFullscreen)}
                className="player-control"
              >
                <CornersOut size={25} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
