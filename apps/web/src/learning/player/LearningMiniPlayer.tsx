import {
  PlayButton,
  PlayerIconButton,
  VideoPlayer,
  type VideoPlayerEvent,
  type VideoPlayerHandle,
  usePlayerTheme,
} from "@veolms/video-player";
import "../../player-runtime.css";
import { useCallback, useEffect, useRef } from "react";
import type { LearningMiniPlayerSession } from "./learningMiniPlayerTypes";
import {
  writeMiniPlayerRestore,
  writeResumePosition,
} from "./lessonPlayerPersistence";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";

interface MiniPlayerControlsProps {
  lessonTitle: string;
  onClose: () => void;
  onRestore: () => void;
}

function MiniPlayerControls({
  lessonTitle,
  onClose,
  onRestore,
}: MiniPlayerControlsProps) {
  const CloseIcon = usePlayerTheme().icons.close;
  return (
    <div className="absolute inset-0 z-30 bg-linear-to-t from-black/34 via-transparent to-black/30">
      <button
        type="button"
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        aria-label={`Return to ${lessonTitle}`}
        onClick={onRestore}
      />
      <div className="absolute inset-0 z-20 m-auto grid size-12 place-items-center">
        <PlayButton
          className="!size-12 !rounded-full !bg-black/62 shadow-lg backdrop-blur-md"
          iconSize={24}
        />
      </div>
      <div className="absolute right-1 top-1 z-20">
        <PlayerIconButton
          label="Close mini player"
          className="!size-10 !rounded-full !bg-black/54 backdrop-blur-md"
          icon={<CloseIcon size={22} />}
          onClick={onClose}
        />
      </div>
    </div>
  );
}

export interface LearningMiniPlayerProps {
  session: LearningMiniPlayerSession;
  onClose: () => void;
  onRestore: () => void;
}

export function LearningMiniPlayer({
  session,
  onClose,
  onRestore,
}: LearningMiniPlayerProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const playerTheme = useLearningPlayerTheme();
  const currentTimeRef = useRef(session.currentTime);

  const persistCurrentTime = useCallback(() => {
    const currentTime =
      playerRef.current?.getSnapshot().media.currentTime ??
      currentTimeRef.current;
    writeResumePosition(session.mediaKey, currentTime);
    return currentTime;
  }, [session.mediaKey]);

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

  const handleEvent = useCallback(
    (event: VideoPlayerEvent) => {
      if (event.type === "timeupdate") {
        currentTimeRef.current = event.detail.currentTime;
      } else if (event.type === "pause" || event.type === "ended") {
        persistCurrentTime();
      }
    },
    [persistCurrentTime],
  );

  useEffect(
    () => () => {
      persistCurrentTime();
    },
    [persistCurrentTime],
  );

  return (
    <aside
      className="fixed right-3 z-150 w-[min(82vw,22rem)] overflow-hidden rounded-xl border border-white/14 bg-black shadow-[0_18px_48px_rgba(0,0,0,0.52)] sm:hidden"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
      aria-label={`Mini player for ${session.lessonTitle}`}
    >
      <VideoPlayer
        ref={playerRef}
        source={{ ...session.source, startTime: session.currentTime }}
        theme={playerTheme}
        engine="shaka"
        autoPlay={session.playing}
        keyboardEnabled={false}
        mediaProps={{ muted: session.muted }}
        onReady={() => playerRef.current?.setPlaybackRate(session.playbackRate)}
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
