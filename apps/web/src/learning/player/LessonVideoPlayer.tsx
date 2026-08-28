import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  VideoPlayer as VeoVideoPlayer,
  type VideoPlayerEvent,
  type VideoPlayerHandle,
  type VideoEngine,
  type VideoSource,
} from "@veolms/video-player";
import type { CourseVideo } from "../courseContent";
import { LessonAmbientProjection } from "./LessonAmbientProjection";
import { LessonPlayerControls } from "./LessonPlayerControls";
import {
  lessonPlayerStorageKeys,
  readAmbientPreference,
  readMutedPreference,
  readResumePosition,
  writeAmbientPreference,
  writeMutedPreference,
  writeResumePosition,
} from "./lessonPlayerPersistence";

const RESUME_PERSIST_INTERVAL_MS = 5_000;

export interface LessonVideoPlayerProps {
  media: CourseVideo;
  lessonTitle: string;
  theaterMode: boolean;
  onTheaterToggle: () => void;
  autoPlayOnMediaChange?: boolean;
  onProgressChange?: (progress: number) => void;
  resumePersistenceKey?: string;
  /** Engine injection is useful for deterministic integration testing. */
  engineFactory?: () => VideoEngine;
}

export function LessonVideoPlayer({
  autoPlayOnMediaChange = false,
  engineFactory,
  lessonTitle,
  media,
  onProgressChange,
  onTheaterToggle,
  resumePersistenceKey,
  theaterMode,
}: LessonVideoPlayerProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const latestPositionRef = useRef(0);
  const lastPersistedAtRef = useRef<number | null>(null);
  const preferencesReadyRef = useRef(false);
  const captionsEnabledRef = useRef(false);
  // Keep the server and first client render deterministic, then restore the
  // device preference after hydration just like the legacy lesson player.
  const [muted, setMuted] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const mediaKey = resumePersistenceKey ?? media.fileName;
  const activeMediaKeyRef = useRef(mediaKey);
  const requestedMediaKeyRef = useRef(mediaKey);
  requestedMediaKeyRef.current = mediaKey;

  const source = useMemo<VideoSource>(
    () => ({
      id: mediaKey,
      src: media.src,
      type: "video/mp4",
      kind: "file",
      // The catalog duration can be stale after an asset replacement. Shaka
      // receives the stored position and the loaded event clamps it against
      // the actual media duration before progress is reported.
      startTime: readResumePosition(mediaKey),
      metadata: {
        duration: media.duration,
        title: lessonTitle,
      },
      textTracks: [
        {
          src: "/assets/designing-users.vtt",
          language: "en",
          label: "English",
          kind: "captions",
          mimeType: "text/vtt",
        },
      ],
    }),
    [lessonTitle, media.duration, media.src, mediaKey],
  );

  const persistResumePosition = useCallback((force = false) => {
    const position = latestPositionRef.current;
    if (!Number.isFinite(position) || position <= 0) return;

    const now = Date.now();
    if (
      !force &&
      lastPersistedAtRef.current !== null &&
      now - lastPersistedAtRef.current < RESUME_PERSIST_INTERVAL_MS
    ) {
      return;
    }

    writeResumePosition(activeMediaKeyRef.current, position);
    lastPersistedAtRef.current = now;
  }, []);

  const handleEvent = useCallback(
    (event: VideoPlayerEvent) => {
      if (event.type === "loaded") {
        const loadedMediaKey = event.detail.source.id;
        if (loadedMediaKey && loadedMediaKey !== requestedMediaKeyRef.current) {
          return;
        }
        activeMediaKeyRef.current =
          loadedMediaKey ?? requestedMediaKeyRef.current;
        const snapshot = playerRef.current?.getSnapshot();
        const actualDuration = event.detail.duration;
        const loadedPosition = snapshot?.media.currentTime ?? 0;
        const clampedPosition =
          actualDuration > 0
            ? Math.min(loadedPosition, Math.max(0, actualDuration - 1))
            : loadedPosition;
        if (clampedPosition !== loadedPosition) {
          playerRef.current?.seekTo(clampedPosition);
        }
        latestPositionRef.current = clampedPosition;
        lastPersistedAtRef.current = null;
        if (clampedPosition > 0 && actualDuration > 0) {
          onProgressChange?.(
            Math.max(0, Math.min(100, (clampedPosition / actualDuration) * 100)),
          );
        }

        if (captionsEnabledRef.current) {
          const preferredTrack =
            snapshot?.media.textTracks.find((track) => track.language === "en") ??
            snapshot?.media.textTracks[0];
          if (preferredTrack) {
            playerRef.current?.selectTextTrack(preferredTrack.id);
          }
        }
      } else if (event.type === "timeupdate") {
        if (activeMediaKeyRef.current !== requestedMediaKeyRef.current) return;
        latestPositionRef.current = event.detail.currentTime;
        persistResumePosition();
        if (event.detail.duration > 0) {
          onProgressChange?.(
            Math.max(
              0,
              Math.min(
                100,
                (event.detail.currentTime / event.detail.duration) * 100,
              ),
            ),
          );
        }
      } else if (event.type === "pause") {
        const snapshot = playerRef.current?.getSnapshot();
        if (snapshot) latestPositionRef.current = snapshot.media.currentTime;
        persistResumePosition(true);
      } else if (event.type === "ended") {
        const snapshot = playerRef.current?.getSnapshot();
        if (snapshot) latestPositionRef.current = snapshot.media.currentTime;
        persistResumePosition(true);
        if (activeMediaKeyRef.current === requestedMediaKeyRef.current) {
          onProgressChange?.(100);
        }
      } else if (event.type === "volumechange") {
        setMuted(event.detail.muted);
        if (preferencesReadyRef.current) {
          writeMutedPreference(event.detail.muted);
        }
      } else if (event.type === "texttrackchange") {
        captionsEnabledRef.current = event.detail.track !== null;
      }
    },
    [onProgressChange, persistResumePosition],
  );

  const handleAmbientEnabledChange = useCallback((enabled: boolean) => {
    setAmbientEnabled(enabled);
    writeAmbientPreference(enabled);
  }, []);

  const handleTheaterModeChange = useCallback(
    (active: boolean) => {
      if (active !== theaterMode) onTheaterToggle();
    },
    [onTheaterToggle, theaterMode],
  );

  useEffect(() => {
    if (!preferencesReady) return;
    playerRef.current?.setMuted(muted);
  }, [muted, preferencesReady]);

  useEffect(() => {
    setMuted(readMutedPreference());
    setAmbientEnabled(readAmbientPreference());
    preferencesReadyRef.current = true;
    setPreferencesReady(true);

    const syncPreferences = (event: StorageEvent) => {
      if (event.key === lessonPlayerStorageKeys.muted) {
        setMuted(event.newValue === "true" || event.newValue === "on");
      } else if (event.key === lessonPlayerStorageKeys.ambient) {
        if (event.newValue === "on") setAmbientEnabled(true);
        if (event.newValue === "off") setAmbientEnabled(false);
      }
    };
    window.addEventListener("storage", syncPreferences);
    return () => {
      preferencesReadyRef.current = false;
      window.removeEventListener("storage", syncPreferences);
    };
  }, []);

  useEffect(() => {
    return () => persistResumePosition(true);
  }, [mediaKey, persistResumePosition]);

  return (
    <VeoVideoPlayer
      ref={playerRef}
      source={source}
      engine="shaka"
      engineFactory={engineFactory}
      autoPlay={autoPlayOnMediaChange}
      ariaLabel={`Lesson video player for ${lessonTitle}`}
      theaterMode={theaterMode}
      onTheaterModeChange={handleTheaterModeChange}
      onEvent={handleEvent}
      lockLandscapeOnFullscreen
      mediaProps={{ muted }}
      playerClassName="border-0 rounded-[13px]"
      controls={
        <LessonPlayerControls
          ambientEnabled={ambientEnabled}
          onAmbientEnabledChange={handleAmbientEnabledChange}
          onTheaterToggle={onTheaterToggle}
        />
      }
      overlays={
        <LessonAmbientProjection
          enabled={ambientEnabled}
          theaterMode={theaterMode}
        />
      }
    />
  );
}
