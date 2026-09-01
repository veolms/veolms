import {
  VideoPlayer,
  type VideoPlayerEvent,
  type VideoPlayerHandle,
} from "@veolms/video-player";
import { useCallback, useEffect, useRef } from "react";
import type {
  LearningMiniPlayerSession,
  LearningPlayerPlaybackSnapshot,
} from "./learningMiniPlayerTypes";
import {
  writeMiniPlayerRestore,
  writeResumePosition,
} from "./lessonPlayerPersistence";
import { registerLearningMiniPlayerRuntime } from "./learningMiniPlayerStore";
import { useLearningMiniPlayerGestures } from "./useLearningMiniPlayerGestures";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";
import { MiniPlayerControls } from "./MiniPlayerControls";

const MAX_HANDOFF_DRIFT_SECONDS = 0.35;

export interface LearningMiniPlayerProps {
  session: LearningMiniPlayerSession;
  onClose: () => void;
  onPrepared?: () => void;
  onRestore: () => void;
  preparing?: boolean;
}

export function LearningMiniPlayer({
  session,
  onClose,
  onPrepared,
  onRestore,
  preparing = false,
}: LearningMiniPlayerProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const miniPlayerRef = useRef<HTMLElement>(null);
  const playerTheme = useLearningPlayerTheme();
  const currentTimeRef = useRef(session.currentTime);
  const preparationCompletedRef = useRef(false);
  const preparationFramePendingRef = useRef(false);
  const preparationStartedRef = useRef(false);
  const pendingPreparationRef = useRef<LearningPlayerPlaybackSnapshot | null>(
    null,
  );

  const persistCurrentTime = useCallback(() => {
    const currentTime =
      playerRef.current?.getSnapshot().media.currentTime ??
      currentTimeRef.current;
    writeResumePosition(session.mediaKey, currentTime);
    return currentTime;
  }, [session.mediaKey]);

  const getPlaybackSnapshot = useCallback(() => {
    const snapshot = playerRef.current?.getSnapshot().media;
    return {
      currentTime: snapshot?.currentTime ?? currentTimeRef.current,
      muted: snapshot?.muted ?? session.muted,
      playbackRate: snapshot?.playbackRate ?? session.playbackRate,
      playing: snapshot?.playing ?? session.playing,
      volume: snapshot?.volume ?? session.volume,
    };
  }, [session.muted, session.playbackRate, session.playing, session.volume]);

  useEffect(
    () =>
      registerLearningMiniPlayerRuntime({
        getPlaybackSnapshot,
        mediaKey: session.mediaKey,
        preparePlaybackHandoff: () => playerRef.current?.setMuted(true),
      }),
    [getPlaybackSnapshot, session.mediaKey],
  );

  const handleClose = useCallback(() => {
    persistCurrentTime();
    onClose();
  }, [onClose, persistCurrentTime]);

  const handleRestore = useCallback(() => {
    const snapshot = playerRef.current?.getSnapshot();
    persistCurrentTime();
    writeMiniPlayerRestore(session.mediaKey, snapshot?.media.playing ?? false);
    onRestore();
  }, [onRestore, persistCurrentTime, session.mediaKey]);

  const miniPlayerGestures = useLearningMiniPlayerGestures(
    miniPlayerRef,
    handleClose,
  );

  const finishPreparation = useCallback(() => {
    const playback =
      session.getLivePlaybackSnapshot?.() ?? pendingPreparationRef.current;
    if (!preparing || preparationCompletedRef.current || !playback) return;

    const candidate = playerRef.current?.getSnapshot().media;
    if (
      playback.playing &&
      candidate &&
      Math.abs(playback.currentTime - candidate.currentTime) >
        MAX_HANDOFF_DRIFT_SECONDS
    ) {
      preparationFramePendingRef.current = false;
      pendingPreparationRef.current = playback;
      playerRef.current?.seekTo(playback.currentTime);
      return;
    }

    preparationCompletedRef.current = true;
    preparationFramePendingRef.current = false;
    pendingPreparationRef.current = null;
    playerRef.current?.setVolume(playback.volume);
    playerRef.current?.setMuted(playback.muted);
    session.preparePlaybackHandoff?.();
    onPrepared?.();
  }, [onPrepared, preparing, session]);

  const completePreparation = useCallback(() => {
    const playback =
      session.getLivePlaybackSnapshot?.() ?? pendingPreparationRef.current;
    if (
      !preparing ||
      preparationCompletedRef.current ||
      preparationFramePendingRef.current ||
      !playback
    ) {
      return;
    }
    pendingPreparationRef.current = playback;
    if (!playback.playing) {
      finishPreparation();
      return;
    }

    const player = playerRef.current;
    if (!player) {
      return;
    }
    const candidate = player.getSnapshot().media;
    if (
      Math.abs(playback.currentTime - candidate.currentTime) >
      MAX_HANDOFF_DRIFT_SECONDS
    ) {
      player.seekTo(playback.currentTime);
      return;
    }
    if (!candidate.playing || candidate.buffering || candidate.seeking) return;

    preparationFramePendingRef.current = true;
    void player.waitForPresentedFrame().then(finishPreparation);
  }, [finishPreparation, preparing, session]);

  const handleEvent = useCallback(
    (event: VideoPlayerEvent) => {
      if (event.type === "timeupdate") {
        currentTimeRef.current = event.detail.currentTime;
      } else if (event.type === "playing") {
        completePreparation();
      } else if (event.type === "seeked") {
        completePreparation();
      } else if (event.type === "pause" || event.type === "ended") {
        persistCurrentTime();
      }
    },
    [completePreparation, persistCurrentTime],
  );

  const handleReady = useCallback(() => {
    if (preparing && preparationStartedRef.current) return;
    if (preparing) preparationStartedRef.current = true;
    const livePlayback = session.getLivePlaybackSnapshot?.() ?? {
      currentTime: session.currentTime,
      muted: session.muted,
      playbackRate: session.playbackRate,
      playing: session.playing,
      volume: session.volume,
    };
    currentTimeRef.current = livePlayback.currentTime;
    playerRef.current?.seekTo(livePlayback.currentTime);
    playerRef.current?.setPlaybackRate(livePlayback.playbackRate);

    if (!preparing) return;
    pendingPreparationRef.current = livePlayback;
    playerRef.current?.setVolume(livePlayback.volume);
    playerRef.current?.setMuted(true);
    if (!livePlayback.playing) {
      completePreparation();
      return;
    }
    void playerRef.current?.play().catch(() => {
      preparationStartedRef.current = false;
      pendingPreparationRef.current = null;
    });
  }, [completePreparation, preparing, session]);

  useEffect(
    () => () => {
      persistCurrentTime();
    },
    [persistCurrentTime],
  );

  return (
    <aside
      ref={miniPlayerRef}
      className="fixed right-3 z-130 w-[82vw] min-w-[50vw] touch-none overflow-hidden rounded-xl bg-black shadow-[0_18px_48px_rgba(0,0,0,0.52)] ring-1 ring-white/14 ring-inset select-none data-[mini-player-mode=dragging]:cursor-grabbing data-[mini-player-mode=dismissing]:pointer-events-none data-[mini-player-mode=dismissing]:transition-[transform,opacity] data-[mini-player-mode=dismissing]:duration-200 data-[mini-player-mode=dismissing]:ease-[cubic-bezier(0.22,1,0.36,1)] data-[mini-player-preparing]:pointer-events-none data-[mini-player-preparing]:opacity-0 sm:hidden motion-reduce:transition-none"
      style={{
        bottom: "calc(70px + env(safe-area-inset-bottom))",
        ...miniPlayerGestures.style,
      }}
      aria-label={`Mini player for ${session.lessonTitle}`}
      aria-describedby="learning-mini-player-gesture-help"
      data-learning-mini-player=""
      data-mini-player-mode={miniPlayerGestures.mode}
      data-mini-player-preparing={preparing || undefined}
      {...miniPlayerGestures.gestureProps}
    >
      <span id="learning-mini-player-gesture-help" className="sr-only">
        Drag to move, pinch to resize, or swipe down quickly to close.
      </span>
      <VideoPlayer
        ref={playerRef}
        source={{ ...session.source, startTime: session.currentTime }}
        theme={playerTheme}
        engine="shaka"
        autoPlay={preparing ? false : session.playing}
        keyboardEnabled={false}
        zoomEnabled={false}
        mediaProps={{ muted: preparing || session.muted }}
        onReady={handleReady}
        onEvent={handleEvent}
        ariaLabel={`Mini player video for ${session.lessonTitle}`}
        className="!rounded-xl"
        playerClassName="!rounded-xl !shadow-none"
        centralControl={false}
        controls={
          <MiniPlayerControls
            lessonTitle={session.lessonTitle}
            onClose={handleClose}
            onRestore={handleRestore}
          />
        }
      />
    </aside>
  );
}
