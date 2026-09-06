import {
  PlayerChromePreview,
  VideoLoadingSpinner,
  getPlayerThemeStyle,
  resolvePlayerTheme,
} from "@veolms/video-player";
import { getInitialLearningPlayerPreferences } from "../learningPlayerPreferences";
import { LessonPlayerControls } from "./LessonPlayerControls";
import type { LessonVideoPlayerProps } from "./LessonVideoPlayer";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";

/**
 * Paints the real lesson chrome before PersistentLearningPlayerHost mounts.
 * The ancestor is pointer-events-none; handlers are inert placeholders.
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
}: LessonVideoPlayerProps) {
  const playerTheme = useLearningPlayerTheme();
  const playerPreferences = getInitialLearningPlayerPreferences();
  const resolvedTheme = resolvePlayerTheme(playerTheme);

  return (
    <div
      className="video-shell relative size-full overflow-visible bg-black"
      data-learning-player-chrome-placeholder=""
      data-player-theme={resolvedTheme.id}
      style={getPlayerThemeStyle(resolvedTheme)}
    >
      <PlayerChromePreview
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
