import {
  PlayerChromePreview,
  VideoLoadingSpinner,
  getPlayerThemeStyle,
  resolvePlayerTheme,
} from "@veolms/video-player";
import {
  DEFAULT_LEARNING_PLAYER_PREFERENCES,
  getInitialLearningPlayerPreferences,
} from "../learningPlayerPreferences";
import { LessonPlayerControls } from "./LessonPlayerControls";
import {
  LessonReadingPlaceholder,
  lessonReadingShellClasses,
} from "./LessonReadingStage";
import type { LessonVideoPlayerProps } from "./LessonVideoPlayer";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";
import { useLayoutEffect, useState } from "react";

/**
 * Paints the real lesson chrome before PersistentLearningPlayerHost mounts.
 * The ancestor is pointer-events-none; handlers are inert placeholders.
 *
 * Only a video lesson gets the video chrome (the loader, the controls). A
 * reading is drawn as a reading on its way, and a quiz as an empty stage:
 * every lesson page is built ahead of time, and a reading used to open on
 * the video loader and its controls until the player started.
 */
export function LessonPlayerChromePlaceholder({
  canGoNext = false,
  canGoPrevious = false,
  courseLessonsOpen = false,
  onAutoplayEnabledChange = () => undefined,
  onCourseLessonsToggle,
  onGoNext = () => undefined,
  onGoPrevious = () => undefined,
  onMinimize,
  lessonStage = "video",
}: LessonVideoPlayerProps) {
  const playerTheme = useLearningPlayerTheme();
  const [playerPreferences, setPlayerPreferences] = useState(
    DEFAULT_LEARNING_PLAYER_PREFERENCES,
  );
  useLayoutEffect(() => {
    setPlayerPreferences(getInitialLearningPlayerPreferences());
  }, []);
  const resolvedTheme = resolvePlayerTheme(playerTheme);

  if (lessonStage !== "video") {
    const reading = lessonStage !== "quiz";
    return (
      <div
        className={`video-shell relative size-full overflow-hidden ${lessonReadingShellClasses}`}
        data-learning-player-chrome-placeholder=""
        role="status"
        aria-label={reading ? "Loading reading" : "Loading quiz"}
      >
        {reading ? <LessonReadingPlaceholder /> : null}
      </div>
    );
  }

  return (
    <div
      className="video-shell relative size-full overflow-visible bg-black"
      data-learning-player-chrome-placeholder=""
      data-player-theme={resolvedTheme.id}
      style={getPlayerThemeStyle(resolvedTheme)}
    >
      <PlayerChromePreview
        key={`${playerPreferences.muted}:${playerPreferences.playbackRate}:${playerPreferences.volume}`}
        muted={playerPreferences.muted}
        playbackRate={playerPreferences.playbackRate}
        theme={playerTheme}
        volume={playerPreferences.volume}
      >
        <LessonPlayerControls
          ambientEnabled={false}
          autoplayEnabled={playerPreferences.autoplay}
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          courseLessonsOpen={courseLessonsOpen}
          onAmbientEnabledChange={() => undefined}
          onAutoplayEnabledChange={onAutoplayEnabledChange}
          onCourseLessonsToggle={onCourseLessonsToggle}
          onGoNext={onGoNext}
          onGoPrevious={onGoPrevious}
          onMinimize={onMinimize ? () => undefined : undefined}
        />
        <div
          className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
          role="status"
          aria-label="Loading video"
          data-video-player-buffering-overlay=""
          data-video-player-buffering-visible="true"
        >
          <VideoLoadingSpinner />
        </div>
      </PlayerChromePreview>
    </div>
  );
}
