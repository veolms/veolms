import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import {
  PlayerErrorNotice,
  PlayerThemeProvider,
  getPlayerThemeStyle,
  VideoPlayer as VeoVideoPlayer,
  VideoPlayerNotice,
  VideoLoadingSpinner,
  type VideoPlayerEvent,
  type VideoPlayerHandle,
  type VideoEngine,
  type VideoSource,
} from "@veolms/video-player";
import type {
  VideoPlaybackBootstrap,
  VideoPlaybackToken,
} from "@veolms/contracts";
import type { CourseVideo } from "../courseContent";
import { readLearningPreferences } from "../../settings/settingsPreferences";
import { LessonAmbientProjection } from "./LessonAmbientProjection";
import { LessonTroubleIllustration } from "./LessonTroubleIllustration";
import { useMiniPlayerSwipeVolume } from "./useMiniPlayerSwipeVolume";
import type { SubscribeOutsideFraction } from "./useLearningMiniPlayerGestures";
import {
  OctopusIllustration,
  type OctopusKind,
} from "../../components/OctopusIllustration";
import {
  LessonEndScreenOverlay,
  type NextLessonInfo,
} from "./LessonEndScreenOverlay";
import {
  CourseLessonsButton,
  LessonCentralControls,
  LessonPlayerControls,
  LessonPlayerMinimizeControl,
  type CourseLessonsSecondPressHoldProps,
} from "./LessonPlayerControls";
import {
  getLessonReadingFrame,
  LessonReadingMiniature,
  LessonReadingStage,
  lessonReadingShellClasses,
} from "./LessonReadingStage";
import {
  LessonReadingFullscreenControls,
  LessonReadingNavigationControls,
  useLessonReadingFullscreen,
} from "./LessonReadingControls";
import { MiniPlayerWindowControls } from "./MiniPlayerControls";
import type { LearningMiniPlayerRequest } from "./learningMiniPlayerTypes";
import {
  DEFAULT_LEARNING_PLAYER_PREFERENCES,
  getInitialLearningPlayerPreferences,
  publishLearningPlayerBootstrap,
} from "../learningPlayerPreferences";
import {
  getLearningMiniPlayerRuntimeSnapshot,
  prepareLearningMiniPlayerPlaybackHandoff,
} from "./learningMiniPlayerStore";
import {
  clearResumePosition,
  consumeMiniPlayerRestore,
  lessonPlayerStorageKeys,
  readAmbientPreference,
  readResumePosition,
  readStartPosition,
  writeAmbientPreference,
  writeMutedPreference,
  writePlaybackRatePreference,
  writeResumePosition,
  readVolumeChange,
  writeVolumePreference,
} from "./lessonPlayerPersistence";
import { createLearningLessonVideoSource } from "./lessonVideoSource";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";
import { useLearningSeekInterval } from "./useLearningSeekInterval";
import { MiniPlayerControls } from "./MiniPlayerControls";
import {
  MINI_PLAYER_VIDEO_CORNERS_CLASS,
  MINI_PLAYER_VIDEO_SHELL_CLASS,
} from "./MiniPlayerInfoBar";
import { LearningMiniPlayerBufferingIndicator } from "./learningMiniPlayerBufferingIndicator";
import {
  useLessonPlayerMinimizeGesture,
  type LessonPlayerMinimizeGestureState,
} from "./useLessonPlayerMinimizeGesture";
import { useLearningPlayerMinimizeShortcut } from "./useLearningPlayerMinimizeShortcut";
import { cn } from "../../lib/utils";
import {
  addWatchedSeconds,
  createWatchTimeTracker,
} from "../learningWatchTime";
import { createPlaybackTelemetry } from "./playbackTelemetry";
import { trackAnalyticsEvent } from "../../lib/analytics-track";

const RESUME_PERSIST_INTERVAL_MS = 5_000;
// A lesson left this close to its end counts as finished when it is reopened.
const FINISHED_LESSON_RESUME_TAIL_SECONDS = 3;
// From here on the next lesson is preloaded, whatever the video's length: a
// percentage would start hours early in a long lesson.
const NEAR_LESSON_END_SECONDS = 60;
// ...and only once this lesson is downloaded to its end, within this much.
// Preloaded while its last segments were still on their way, the next
// lesson took the link from them on a slow connection: they came late or
// failed, and the video stopped in its last seconds.
const LESSON_END_BUFFERED_TOLERANCE_SECONDS = 0.5;
const LESSON_PLAYER_CONTROLS_IDLE_DELAY_MS = 1_000;

/** Whether what is buffered reaches from `currentTime` to the end. */
function bufferedToEnd(
  buffered: readonly { start: number; end: number }[],
  currentTime: number,
  duration: number,
): boolean {
  return buffered.some(
    (range) =>
      range.start <= currentTime + 0.1 &&
      range.end >= duration - LESSON_END_BUFFERED_TOLERANCE_SECONDS,
  );
}
// On a touch screen the controls stay as long as YouTube's do: a second was
// gone before the finger that showed them reached a button.
const LESSON_PLAYER_CONTROLS_TOUCH_IDLE_DELAY_MS = 3_000;
/** How long a volume taken from another tab counts as that tab's. */
const REMOTE_VOLUME_ECHO_MS = 2_000;
/** Another tab's volume is applied at most this often. */
const REMOTE_VOLUME_APPLY_INTERVAL_MS = 150;
const MAX_MINI_PLAYER_RESTORE_DRIFT_SECONDS = 0.35;
const LESSON_PLAYER_SHORTCUTS = {
  seekBackwardLarge: false,
  seekForwardLarge: false,
  toggleTheaterMode: false,
  togglePictureInPicture: false,
} as const;

type FullscreenCoursePanelStyle = CSSProperties & {
  "--learning-fullscreen-panel-offset-x": string;
  "--learning-fullscreen-video-offset-x": string;
  "--learning-fullscreen-video-pane-width": string;
  "--learning-fullscreen-video-width": string;
};

export interface LessonVideoPlayerProps {
  media: CourseVideo;
  description?: string | null;
  lessonTitle: string;
  courseTitle?: string;
  lessonIndex?: number;
  totalLessons?: number;
  theaterMode: boolean;
  /** The video area has been dragged short (LESSON_PLAYER_SHORT_HEIGHT). */
  shortPlayer?: boolean;
  /** Shorter still (LESSON_PLAYER_SEEK_TIME_ONLY_HEIGHT). */
  seekTimeOnly?: boolean;
  onTheaterToggle: () => void;
  autoPlayOnMediaChange?: boolean;
  autoplayEnabled?: boolean;
  showAutoplayControl?: boolean;
  /** Shows the learner-facing completion overlay when playback ends. */
  showCompletionOverlay?: boolean;
  /**
   * False while other lessons are unfinished, so ending the last lesson does
   * not say the whole course is complete. Left out, the course counts as
   * complete.
   */
  courseComplete?: boolean;
  circularSettingsControl?: boolean;
  showLessonNavigation?: boolean;
  playbackSuspended?: boolean;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  nextLessonInfo?: NextLessonInfo;
  courseLessonsOpen?: boolean;
  courseLessonsDrawerOpen?: boolean;
  courseLessonsPanel?: ReactNode;
  courseLessonsSecondPressHold?: CourseLessonsSecondPressHoldProps;
  courseLessonsShortcutLabel?: string;
  courseLessonsSidePanel?: boolean;
  /** The lessons drawer is a bottom sheet rather than a side drawer. */
  courseLessonsBottomSheet?: boolean;
  courseLessonsVideoWidthPercent?: number;
  /** Element over the course content column that hosts the chapters panel. */
  chaptersPanelHost?: HTMLElement | null;
  onAutoplayEnabledChange?: (enabled: boolean) => void;
  onCourseLessonsToggle?: (presentation: "drawer" | "side") => void;
  onGoNext?: () => void;
  onGoPrevious?: () => void;
  /**
   * Set when the lesson has a quiz: it opens the quiz. The screen at the end
   * of the video then offers the quiz (Attempt Quiz, Skip Quiz) instead of
   * counting down to the next lesson, and the player's Next shows that
   * screen first.
   */
  onAttemptQuiz?: () => void;
  onLessonEnded?: () => void;
  onMinimize?: (request: LearningMiniPlayerRequest) => void;
  onMinimizeGestureStart?: () => void;
  /**
   * Hands the owner a way to start the animated minimize itself, so it can
   * turn an expand around before it has finished.
   */
  onMinimizeTriggerReady?: (trigger: (() => void) | null) => void;
  onMinimizeGestureChange?: (state: LessonPlayerMinimizeGestureState) => void;
  minimizeMotionTarget?: () => HTMLElement | null;
  onMiniPlayerRestoreReady?: () => void;
  onMiniClose?: () => void;
  onMiniRestore?: () => void;
  /**
   * The mini player is being swiped away: a playing video's sound fades out
   * with it instead of stopping at once when it is gone.
   */
  fadeOutAudio?: boolean;
  /**
   * Tells how much of the mini player is dragged out of the window, 0 to 1,
   * as it moves: a playing video's sound drops by as much (see
   * useMiniPlayerSwipeVolume).
   */
  subscribeSwipeOutsideFraction?: SubscribeOutsideFraction;
  onMobileLandscapeFullscreenChange?: (active: boolean) => void;
  onProgressChange?: (progress: number) => void;
  /**
   * Called on every time update once a minute or less of the video is left
   * (see `NEAR_LESSON_END_SECONDS`); the owner decides what to do once.
   */
  onNearLessonEnd?: () => void;
  /**
   * The course this lesson belongs to, as the progress API knows it. With
   * it, the seconds of video actually played are tallied towards the
   * learner's daily goal (see learningWatchTime.ts).
   */
  watchTimeCourseKey?: string;
  /** Registers a lifecycle-scoped bridge for inline Learning Space timestamps. */
  onSeekToTimestampReady?: (
    seekToTimestamp: (seconds: number) => void,
  ) => void | (() => void);
  presentation?: "full" | "mini";
  resumePersistenceKey?: string;
  /** Runtime playback data returned by the authorized bootstrap endpoint. */
  playbackBootstrap?: VideoPlaybackBootstrap | null;
  /** A classified bootstrap result that prevents unauthorized media loading. */
  playbackAccessError?: {
    /**
     * `notice` is a plain statement that is not a failure (a lesson with no
     * video): shown like `retry`, without being announced as an alert.
     */
    kind: "login" | "access" | "retry" | "notice";
    message: string;
    actionLabel: string;
    onAction?: () => void;
    /** Shown as the heading in place of the one the kind would get. */
    title?: string;
    /** A way out to another page, shown under the action. */
    link?: { label: string; href: string };
    /**
     * The octopus to draw over a `retry` message in the full player: a
     * failure gets the same picture a failed video does, a missing course
     * the one for things not found. Without it the message stands alone.
     */
    illustration?: OctopusKind;
    /**
     * A reading lesson's text (Markdown). The full player shows it where the
     * video would be, in place of the title and message.
     */
    article?: string;
  } | null;
  /** Prevents the fallback media source from loading before protected bootstrap resolves. */
  playbackBootstrapPending?: boolean;
  /** Shown when the lesson has no playable source because loading it failed. */
  playbackUnavailableMessage?: string | null;
  onRetryPlayback?: () => void;
  /** Refreshes only the short-lived CDN segment token when playback runs long. */
  refreshPlaybackToken?: () => Promise<VideoPlaybackToken>;
  /** Legacy caller hint retained while all protected access moves to tokens. */
  protectedPlayback?: boolean;
  /** Engine injection is useful for deterministic integration testing. */
  engineFactory?: () => VideoEngine;
}

/**
 * The lesson's picture, dimmed and out of focus, behind a message that
 * stands where the video would: a lesson that cannot play yet still shows
 * what it is, instead of an empty black screen.
 */
/**
 * A failed player shorter than this gives its controls up, and the message
 * takes the whole of it. The top row, the timeline and the bottom row take
 * 116px between them; under 300px that leaves the message so little that
 * its drawing was a third of an inch tall or was dropped altogether, beside
 * controls that have nothing to play. Without them the drawing has room to
 * be seen (about 100px in a 260px player).
 */
const FAILED_PLAYER_CONTROLS_MIN_HEIGHT = 300;

/**
 * Marks the player while it has failed (`data-learning-player-failed`), and
 * while it has failed and is too short for its controls
 * (`data-learning-player-failed-small`). The player then shows only what
 * went wrong and the way to try again. It is mounted with the failure's
 * message, so the mark comes and goes with the failure; the size is
 * measured, because a player is small for several reasons (a narrow
 * column, a height the learner dragged it to) that no one rule knows.
 */
function FailedPlayerSizeMark() {
  const probeRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const shell = probeRef.current?.closest<HTMLElement>(
      "[data-learning-player-motion-surface]",
    );
    if (!shell) return undefined;
    const update = () =>
      shell.toggleAttribute(
        "data-learning-player-failed-small",
        shell.clientHeight < FAILED_PLAYER_CONTROLS_MIN_HEIGHT,
      );
    shell.setAttribute("data-learning-player-failed", "");
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => {
      observer.disconnect();
      shell.removeAttribute("data-learning-player-failed");
      shell.removeAttribute("data-learning-player-failed-small");
    };
  }, []);
  return <span ref={probeRef} hidden />;
}

/**
 * A failed player by day stands on a light stage (`LessonPictureBackdrop`),
 * so everything drawn on it in white turns dark: the message, and the
 * controls through the player theme's own variables. The theme sets those
 * on this same element, hence the `!`. Nothing here applies while a video
 * is on screen: only a failure carries the mark.
 */
const failedByDayClasses = [
  // The theme writes its variables on the shell, on the player inside it
  // and on the layer of corner controls, so each is told. The names are
  // written out in full: Tailwind only makes the classes it can read.
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-text:rgb(15_23_42/0.92)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-text:rgb(15_23_42/0.92)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-text-muted:rgb(15_23_42/0.62)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-text-muted:rgb(15_23_42/0.62)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-surface:rgb(255_255_255/0.72)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-surface:rgb(255_255_255/0.72)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-surface-hover:rgb(15_23_42/0.1)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-surface-hover:rgb(15_23_42/0.1)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-surface-active:rgb(15_23_42/0.16)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-surface-active:rgb(15_23_42/0.16)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-hover:rgb(15_23_42/0.1)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-hover:rgb(15_23_42/0.1)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-border:rgb(15_23_42/0.12)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-border:rgb(15_23_42/0.12)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-control-shadow:0_1px_3px_rgb(15_23_42/0.16)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-control-shadow:0_1px_3px_rgb(15_23_42/0.16)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-timeline-track:rgb(15_23_42/0.2)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-timeline-track:rgb(15_23_42/0.2)]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[--video-player-vignette-rgb:255_255_255]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:[--video-player-vignette-rgb:255_255_255]!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:text-slate-900!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_:is([data-video-player-root],[data-player-bottom-corner-controls-layer])]:text-slate-900!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_[data-video-player-notice-content]_*]:text-slate-900",
  // The layers of controls name white outright, and what is in them takes it.
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_.text-white]:text-slate-900!",
  "[:root[data-theme=light]_&]:data-learning-player-failed:[&_[data-player-control]]:text-(--video-player-control-text)!",
].join(" ");

function LessonPictureBackdrop({
  src,
  followTheme = false,
}: {
  src?: string;
  /**
   * By day the stage is a light one with the accent's glow in the middle,
   * and the lesson's picture is left out of it. Only for a surface whose
   * own text and controls turn dark with it (see `failedByDayClasses`).
   */
  followTheme?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      // A lesson with no picture, or one whose picture does not load, still
      // gets a lit stage in the page's accent rather than plain black.
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_70%_80%_at_50%_42%,color-mix(in_srgb,var(--accent)_30%,#070b16)_0,#070b16_68%,#04060c_100%)] ${
        followTheme
          ? "[:root[data-theme=light]_&]:bg-[radial-gradient(ellipse_62%_74%_at_50%_42%,color-mix(in_srgb,var(--accent)_26%,white)_0,color-mix(in_srgb,var(--accent)_7%,white)_58%,color-mix(in_srgb,var(--accent)_3%,#f4f5f7)_100%)] [:root[data-theme=light]_&]:*:hidden"
          : ""
      }`}
    >
      {src ? (
        <>
          <img
            src={src}
            alt=""
            decoding="async"
            // Lightly softened, so the course stays recognisable behind the
            // message; the shade below keeps the message readable.
            className="size-full scale-105 object-cover opacity-70 blur-[3px]"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
          <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(0_0_0/0.62)_0,rgb(0_0_0/0.32)_55%,rgb(0_0_0/0.6)_100%)] [img[hidden]+&]:hidden" />
        </>
      ) : null}
    </div>
  );
}

export function LessonVideoPlayer({
  autoPlayOnMediaChange = false,
  autoplayEnabled = true,
  showAutoplayControl = true,
  showCompletionOverlay = true,
  courseComplete = true,
  circularSettingsControl = false,
  showLessonNavigation = true,
  playbackSuspended = false,
  canGoNext = false,
  canGoPrevious = false,
  nextLessonInfo,
  courseLessonsOpen = false,
  courseLessonsDrawerOpen = false,
  courseLessonsPanel,
  courseLessonsSecondPressHold,
  courseLessonsShortcutLabel,
  courseLessonsSidePanel = false,
  courseLessonsBottomSheet = false,
  courseLessonsVideoWidthPercent = 60,
  chaptersPanelHost,
  courseTitle,
  engineFactory,
  description,
  lessonIndex,
  lessonTitle,
  media,
  totalLessons,
  onProgressChange,
  onNearLessonEnd,
  watchTimeCourseKey,
  onAutoplayEnabledChange = () => undefined,
  onCourseLessonsToggle,
  onGoNext: goToNextLesson = () => undefined,
  onGoPrevious = () => undefined,
  onAttemptQuiz,
  onLessonEnded,
  onMinimize,
  onMinimizeGestureStart,
  onMinimizeTriggerReady,
  onMinimizeGestureChange,
  minimizeMotionTarget,
  onMiniPlayerRestoreReady,
  onMiniClose,
  onMiniRestore,
  fadeOutAudio = false,
  subscribeSwipeOutsideFraction,
  onMobileLandscapeFullscreenChange,
  onTheaterToggle,
  onSeekToTimestampReady,
  resumePersistenceKey,
  shortPlayer = false,
  seekTimeOnly = false,
  theaterMode,
  presentation = "full",
  playbackBootstrap,
  playbackAccessError = null,
  playbackBootstrapPending = false,
  playbackUnavailableMessage = null,
  onRetryPlayback,
  refreshPlaybackToken,
  protectedPlayback = false,
}: LessonVideoPlayerProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const latestPositionRef = useRef(0);
  const lastPersistedAtRef = useRef<number | null>(null);
  const preferencesReadyRef = useRef(false);
  const captionsEnabledRef = useRef(false);
  const handoffMutingRef = useRef(false);
  const [initialPlayerPreferences] = useState(
    () => DEFAULT_LEARNING_PLAYER_PREFERENCES,
  );
  const playerPrefsRef = useRef({ ...initialPlayerPreferences });
  const playbackPrefsAppliedRef = useRef(false);
  const applyingPlaybackPrefsRef = useRef(false);
  // A mini player dragged out of the window, or swiped away: its sound is
  // lowered with it. Set while it is, to the learner's own volume; the
  // lowered volumes are not the learner's, and are never saved.
  const swipeHeldVolumeRef = useMiniPlayerSwipeVolume(
    playerRef,
    subscribeSwipeOutsideFraction,
    fadeOutAudio,
  );
  // Volumes taken from another tab (a `storage` event) in the last moments.
  // The volume change each causes here is that tab's, not this one's, and
  // is not saved again: saved, it reached the other tab as a new change,
  // and with volume changes reported a moment late the tabs sent each
  // other's older values back and forth without end (the slider kept
  // moving on its own, and a tab could hang).
  const remoteVolumesRef = useRef<Array<{ volume: number; until: number }>>([]);
  const [muted, setMuted] = useState(initialPlayerPreferences.muted);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const seekIntervalSeconds = useLearningSeekInterval();
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [mobileLandscapeFullscreen, setMobileLandscapeFullscreen] =
    useState(false);
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [autoplayCancelled, setAutoplayCancelled] = useState(false);
  // The lesson's quiz is offered at its end, in the full player only: the
  // quiz opens on the lesson page, which the mini window is away from.
  const lessonQuizOffered =
    presentation === "full" && showCompletionOverlay && Boolean(onAttemptQuiz);
  // The end screen was opened by the player's Next, before the video ended,
  // to offer the quiz: the rules that close it once the video is no longer
  // at its end do not apply to it (pausing for it reports the time).
  const quizOfferedBeforeEndRef = useRef(false);
  // Next, from the player's buttons and Shift+N, offers the lesson's quiz
  // first: the end screen with Attempt Quiz and Skip Quiz.
  const onGoNext = useCallback(() => {
    if (lessonQuizOffered && !showEndScreen) {
      quizOfferedBeforeEndRef.current = true;
      playerRef.current?.pause();
      setAutoplayCancelled(false);
      setShowEndScreen(true);
      return;
    }
    goToNextLesson();
  }, [goToNextLesson, lessonQuizOffered, showEndScreen]);
  const playerTheme = useLearningPlayerTheme();
  const mediaKey = resumePersistenceKey ?? media.fileName;
  const activeMediaKeyRef = useRef(mediaKey);
  const requestedMediaKeyRef = useRef(mediaKey);
  // The lesson whose stored resume position has already been applied.
  const resumeAppliedMediaKeyRef = useRef<string | null>(null);
  // Whether this player takes over from the mini player (see
  // finishMiniPlayerRestore), and for which lesson.
  const [openedFromMiniPlayer] = useState(() => {
    const restore = consumeMiniPlayerRestore(mediaKey);
    return { mediaKey, restore };
  });
  const restoreAutoplayRef = useRef(openedFromMiniPlayer.restore);
  const restoreFramePendingRef = useRef(false);
  const restoreResyncAttemptedRef = useRef(false);
  requestedMediaKeyRef.current = mediaKey;

  useEffect(() => {
    if (!onSeekToTimestampReady) return undefined;

    const registeredMediaKey = mediaKey;
    const seekToTimestamp = (seconds: number) => {
      if (
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        activeMediaKeyRef.current !== registeredMediaKey ||
        requestedMediaKeyRef.current !== registeredMediaKey
      ) {
        return;
      }

      const player = playerRef.current;
      if (!player) return;

      try {
        const duration = player.getSnapshot().media.duration;
        if (Number.isFinite(duration) && duration > 0 && seconds > duration) {
          return;
        }

        player.seekTo(seconds);
      } catch {
        // The player may be between media lifecycles; a later click can retry.
      }
    };

    return onSeekToTimestampReady(seekToTimestamp);
  }, [mediaKey, onSeekToTimestampReady]);

  const playbackMedia = useMemo(
    () =>
      playbackBootstrap
        ? {
            ...media,
            src: playbackBootstrap.manifestUrl,
            duration: playbackBootstrap.duration ?? media.duration,
          }
        : media,
    [media, playbackBootstrap],
  );

  // Chapters are parsed from the description; the API only adds the still
  // captured at each chapter's first second.
  const chapterThumbnails = useMemo(() => {
    const thumbnails: Record<number, string> = {};
    for (const chapter of playbackBootstrap?.chapters ?? []) {
      if (chapter.thumbnailUrl) {
        thumbnails[chapter.startSeconds] = chapter.thumbnailUrl;
      }
    }
    return thumbnails;
  }, [playbackBootstrap?.chapters]);

  // How many times a lesson being left was stopped (see the layout effect
  // that stops it); part of every source after it.
  const [playerStops, setPlayerStops] = useState(0);
  const source = useMemo<VideoSource>(() => {
    const resumeFromLastPosition =
      readLearningPreferences().resumeFromLastPosition;
    // A lesson opened where it was left starts a few seconds before it; one
    // taken over from the mini player carries on where it is.
    const handedOver =
      openedFromMiniPlayer.restore !== null &&
      openedFromMiniPlayer.mediaKey === mediaKey;
    const lessonSource = createLearningLessonVideoSource({
      media: playbackMedia,
      mediaKey,
      startTime: !resumeFromLastPosition
        ? 0
        : handedOver
          ? readResumePosition(mediaKey)
          : readStartPosition(mediaKey),
      protectedPlayback: playbackBootstrap
        ? playbackBootstrap.source === "paid-bootstrap-api"
        : protectedPlayback,
      segmentToken: playbackBootstrap?.segmentToken,
      segmentTokenExpiresAt: playbackBootstrap?.segmentTokenExpiresAt,
      inlinedMasterManifest: playbackBootstrap?.inlinedMasterManifest,
      subtitles: playbackBootstrap?.subtitles,
      refreshSegmentToken:
        playbackBootstrap?.segmentToken && refreshPlaybackToken
          ? refreshPlaybackToken
          : undefined,
    });
    return playerStops === 0
      ? lessonSource
      : {
          ...lessonSource,
          metadata: { ...lessonSource.metadata, playerStops },
        };
  }, [
    mediaKey,
    openedFromMiniPlayer,
    playbackBootstrap,
    playbackMedia,
    playerStops,
    protectedPlayback,
    refreshPlaybackToken,
  ]);

  // Opening another lesson whose bootstrap is still on its way used to swap
  // the whole player for the waiting surface, so the player, its Shaka
  // engine and the <video> were destroyed and built again once it arrived:
  // close to a second of black with no controls on every such switch. The
  // player now stays, held paused on the lesson it last played under the
  // same waiting surface, and loads the new lesson in place when its
  // bootstrap comes, as a hovered lesson does. Nothing of the held lesson
  // counts for the new one: progress is written under the key of the video
  // actually loaded (`activeMediaKeyRef`), and it is paused.
  //
  // In full screen the element in full screen is the player itself, so
  // replacing it would also leave full screen and turn a phone back
  // upright. There it stays for any wait, the same lesson's bootstrap
  // fetched again or a lesson with no source yet included. Access gates and
  // failures still show their own stage.
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  // What the player last played; written where the player is drawn.
  const lastPlayableRef = useRef<{
    source: VideoSource;
    mediaKey: string;
    description: string | null | undefined;
    chapterThumbnails: Record<number, string>;
    spriteStoryboardUrl: string | undefined;
  } | null>(null);
  const lastPlayable = lastPlayableRef.current;
  const holdingPreviousLesson =
    lastPlayable !== null &&
    !playbackAccessError &&
    ((playbackBootstrapPending && lastPlayable.mediaKey !== mediaKey) ||
      (presentation === "full" &&
        playerFullscreen &&
        playerRef.current !== null &&
        !playbackUnavailableMessage &&
        (playbackBootstrapPending || !playbackMedia.src)));
  const playbackPaused = playbackSuspended || holdingPreviousLesson;
  // Read by the player's events, which can arrive (the new lesson loading)
  // before the callback that handles them is replaced.
  const holdingPlaybackRef = useRef(holdingPreviousLesson);
  holdingPlaybackRef.current = holdingPreviousLesson;

  useEffect(() => {
    quizOfferedBeforeEndRef.current = false;
    setShowEndScreen(false);
    setAutoplayCancelled(false);
  }, [mediaKey]);

  useEffect(() => {
    if (!showCompletionOverlay) setShowEndScreen(false);
  }, [showCompletionOverlay]);

  useEffect(() => {
    if (playbackPaused) {
      playerRef.current?.pause();
    }
  }, [playbackPaused]);

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

  // The moment another lesson is asked for, the one playing is stopped
  // outright: paused, its source taken off and its streaming player
  // destroyed (`VideoPlayerHandle.stop`). Holding it paused was not enough:
  // a play or a load's autoplay arriving while the new lesson's bootstrap
  // was on its way started it again, and it played on, its sound under the
  // loader, until the new lesson was in. A layout effect, so it is stopped
  // before the player is handed the new lesson's source (a passive effect).
  const stoppedForMediaKeyRef = useRef(mediaKey);
  useLayoutEffect(() => {
    if (stoppedForMediaKeyRef.current === mediaKey) return;
    stoppedForMediaKeyRef.current = mediaKey;
    if (activeMediaKeyRef.current === mediaKey) return;
    // Where the lesson being left was is kept before it is unloaded.
    persistResumePosition(true);
    latestPositionRef.current = 0;
    const player = playerRef.current;
    if (!player) return;
    void player.stop().catch(() => undefined);
    // A source the player was given before the stop is not loaded again on
    // its own (an equal source is no reason to reload), so a lesson opened
    // again straight after leaving it would stay empty. Each stop makes the
    // next source a new one.
    setPlayerStops((stops) => stops + 1);
  }, [mediaKey, persistResumePosition]);

  const finishMiniPlayerRestore = useCallback(() => {
    if (restoreAutoplayRef.current === null) return;
    const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
    playerRef.current?.setVolume(
      livePlayback?.volume ??
        playerRef.current?.getSnapshot().media.volume ??
        1,
    );
    playerRef.current?.setMuted(livePlayback?.muted ?? muted);
    prepareLearningMiniPlayerPlaybackHandoff(mediaKey);
    restoreAutoplayRef.current = null;
    restoreFramePendingRef.current = false;
    restoreResyncAttemptedRef.current = false;
    onMiniPlayerRestoreReady?.();
  }, [mediaKey, muted, onMiniPlayerRestoreReady]);

  const finishMiniPlayerRestoreAfterPresentedFrame = useCallback(() => {
    if (restoreAutoplayRef.current === null || restoreFramePendingRef.current) {
      return;
    }
    const player = playerRef.current;
    if (!player) return;

    restoreFramePendingRef.current = true;
    void player.waitForPresentedFrame().then(() => {
      restoreFramePendingRef.current = false;
      if (restoreAutoplayRef.current === null) return;
      const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
      const restoredPlayback = player.getSnapshot().media;
      if (
        restoreAutoplayRef.current === true &&
        livePlayback &&
        Math.abs(livePlayback.currentTime - restoredPlayback.currentTime) >
          MAX_MINI_PLAYER_RESTORE_DRIFT_SECONDS
      ) {
        player.seekTo(livePlayback.currentTime);
        return;
      }
      finishMiniPlayerRestore();
    });
  }, [finishMiniPlayerRestore, mediaKey]);

  const tryFinishPlayingMiniPlayerRestore = useCallback(() => {
    if (restoreAutoplayRef.current !== true) return;
    const playerSnapshot = playerRef.current?.getSnapshot().media;
    if (
      !playerSnapshot?.playing ||
      playerSnapshot.buffering ||
      playerSnapshot.seeking
    ) {
      return;
    }

    const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
    if (
      livePlayback &&
      !restoreResyncAttemptedRef.current &&
      Math.abs(livePlayback.currentTime - playerSnapshot.currentTime) >
        MAX_MINI_PLAYER_RESTORE_DRIFT_SECONDS
    ) {
      restoreResyncAttemptedRef.current = true;
      playerRef.current?.seekTo(livePlayback.currentTime);
      return;
    }
    finishMiniPlayerRestoreAfterPresentedFrame();
  }, [finishMiniPlayerRestoreAfterPresentedFrame, mediaKey]);

  const watchTimeCourseKeyRef = useRef(watchTimeCourseKey);
  useEffect(() => {
    watchTimeCourseKeyRef.current = watchTimeCourseKey;
  }, [watchTimeCourseKey]);
  const [trackWatchTime] = useState(() =>
    createWatchTimeTracker((seconds) => {
      const courseKey = watchTimeCourseKeyRef.current;
      if (courseKey) addWatchedSeconds(courseKey, seconds);
    }),
  );
  // One playback summary per video for the analytics sink (startup time,
  // rebuffering, errors, time at each quality); nothing when no sink is
  // registered. Reported when the video is unloaded, on an error, when
  // the page is hidden and when the player goes away.
  const lessonIndexRef = useRef(lessonIndex);
  lessonIndexRef.current = lessonIndex;
  const [playbackTelemetry] = useState(() =>
    createPlaybackTelemetry(() => ({
      courseKey: watchTimeCourseKeyRef.current ?? null,
      lessonNumber: lessonIndexRef.current ?? null,
    })),
  );
  useEffect(() => {
    const flush = () => playbackTelemetry.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [playbackTelemetry]);

  const handleEvent = useCallback(
    (event: VideoPlayerEvent) => {
      trackWatchTime(event);
      playbackTelemetry.handle(event);
      if (event.type === "fullscreenchange") {
        setPlayerFullscreen(event.detail.active);
      }
      if (playbackSuspended || holdingPlaybackRef.current) {
        if (
          event.type === "playing" ||
          event.type === "play" ||
          event.type === "loaded"
        ) {
          playerRef.current?.pause();
        }
      }
      if (event.type === "loaded") {
        const loadedMediaKey = event.detail.source.id;
        if (loadedMediaKey && loadedMediaKey !== requestedMediaKeyRef.current) {
          return;
        }
        activeMediaKeyRef.current =
          loadedMediaKey ?? requestedMediaKeyRef.current;
        setShowEndScreen(false);
        setAutoplayCancelled(false);
        const snapshot = playerRef.current?.getSnapshot();
        const actualDuration = event.detail.duration;
        const loadedPosition = snapshot?.media.currentTime ?? 0;
        // A lesson reopened at its end, or within moments of it, used to
        // start on its last second, finish again at once and move on to the
        // next lesson. It starts over instead. Only the position stored for
        // a lesson being opened is treated this way: a reload during
        // playback, or a hand-over from the mini player, stays where the
        // viewer is.
        const opensStoredPosition =
          resumeAppliedMediaKeyRef.current !== activeMediaKeyRef.current &&
          restoreAutoplayRef.current === null;
        resumeAppliedMediaKeyRef.current = activeMediaKeyRef.current;
        const reopenedAtEnd =
          opensStoredPosition &&
          actualDuration > 0 &&
          loadedPosition >=
            actualDuration - FINISHED_LESSON_RESUME_TAIL_SECONDS;
        const clampedPosition = reopenedAtEnd
          ? 0
          : actualDuration > 0
            ? Math.min(loadedPosition, Math.max(0, actualDuration - 1))
            : loadedPosition;
        if (clampedPosition !== loadedPosition) {
          playerRef.current?.seekTo(clampedPosition);
        }
        latestPositionRef.current = clampedPosition;
        lastPersistedAtRef.current = null;
        applyingPlaybackPrefsRef.current = true;
        try {
          playerRef.current?.setPlaybackRate(
            playerPrefsRef.current.playbackRate,
          );
          playerRef.current?.setVolume(playerPrefsRef.current.volume);
          playerRef.current?.setMuted(
            restoreAutoplayRef.current !== null
              ? true
              : playerPrefsRef.current.muted,
          );
        } finally {
          applyingPlaybackPrefsRef.current = false;
          playbackPrefsAppliedRef.current = true;
        }
        if (restoreAutoplayRef.current !== null) {
          const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
          if (livePlayback) {
            latestPositionRef.current = livePlayback.currentTime;
            playerRef.current?.seekTo(livePlayback.currentTime);
            playerRef.current?.setPlaybackRate(livePlayback.playbackRate);
          }
          if (restoreAutoplayRef.current === false) {
            window.setTimeout(finishMiniPlayerRestore, 0);
          }
        }
        if (clampedPosition > 0 && actualDuration > 0) {
          onProgressChange?.(
            Math.max(
              0,
              Math.min(100, (clampedPosition / actualDuration) * 100),
            ),
          );
        }

        if (captionsEnabledRef.current) {
          const preferredTrack =
            snapshot?.media.textTracks.find(
              (track) => track.language === "en",
            ) ?? snapshot?.media.textTracks[0];
          if (preferredTrack) {
            playerRef.current?.selectTextTrack(preferredTrack.id);
          }
        }
      } else if (event.type === "timeupdate") {
        if (activeMediaKeyRef.current !== requestedMediaKeyRef.current) return;
        latestPositionRef.current = event.detail.currentTime;
        persistResumePosition();
        tryFinishPlayingMiniPlayerRestore();
        // Not while the timeline is dragged: every step of the drag seeks,
        // and each reported a new progress that re-rendered the whole lesson
        // list. The seek where it is let go reports where it ended.
        const scrubbing = playerRef.current?.getSnapshot().ui.scrubbing;
        if (event.detail.duration > 0) {
          if (!scrubbing) {
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
          if (
            event.detail.duration - event.detail.currentTime <=
              NEAR_LESSON_END_SECONDS &&
            bufferedToEnd(
              playerRef.current?.getSnapshot().media.buffered ?? [],
              event.detail.currentTime,
              event.detail.duration,
            )
          ) {
            onNearLessonEnd?.();
          }
          if (
            showEndScreen &&
            !quizOfferedBeforeEndRef.current &&
            event.detail.currentTime < event.detail.duration - 1
          ) {
            setShowEndScreen(false);
          }
        }
      } else if (event.type === "play") {
        // Played from under the quiz the player's Next offered: the learner
        // went back to the video.
        if (quizOfferedBeforeEndRef.current) {
          quizOfferedBeforeEndRef.current = false;
          setShowEndScreen(false);
        }
      } else if (event.type === "playing") {
        tryFinishPlayingMiniPlayerRestore();
      } else if (event.type === "seeked") {
        tryFinishPlayingMiniPlayerRestore();
        const snapshot = playerRef.current?.getSnapshot();
        const duration = snapshot?.media.duration ?? 0;
        const currentTime = snapshot?.media.currentTime ?? 0;
        if (
          showEndScreen &&
          !quizOfferedBeforeEndRef.current &&
          duration > 0 &&
          currentTime < duration - 1
        ) {
          setShowEndScreen(false);
        }
        // Where a drag of the timeline ended (its own steps report nothing,
        // see `timeupdate`), also for a paused video.
        if (duration > 0 && !snapshot?.ui.scrubbing) {
          onProgressChange?.(
            Math.max(0, Math.min(100, (currentTime / duration) * 100)),
          );
        }
      } else if (event.type === "pause") {
        const snapshot = playerRef.current?.getSnapshot();
        if (snapshot) latestPositionRef.current = snapshot.media.currentTime;
        persistResumePosition(true);
      } else if (event.type === "ended") {
        // A finished lesson has nowhere to resume from. Storing its end as
        // the place to resume reopened it on its last second. The position
        // in hand is dropped too, so moving on to another lesson after it
        // ends does not store the end again.
        latestPositionRef.current = 0;
        clearResumePosition(activeMediaKeyRef.current);
        if (activeMediaKeyRef.current === requestedMediaKeyRef.current) {
          trackAnalyticsEvent("lesson_video_completed", {
            props: {
              courseKey: watchTimeCourseKeyRef.current ?? "",
              lessonNumber: lessonIndexRef.current ?? -1,
            },
          });
          onProgressChange?.(100);
          onLessonEnded?.();
          quizOfferedBeforeEndRef.current = false;
          if (showCompletionOverlay) setShowEndScreen(true);
          setAutoplayCancelled(false);
        }
      } else if (event.type === "volumechange") {
        if (
          swipeHeldVolumeRef.current !== null ||
          restoreAutoplayRef.current !== null ||
          handoffMutingRef.current ||
          applyingPlaybackPrefsRef.current
        ) {
          return;
        }
        setMuted(event.detail.muted);
        playerPrefsRef.current.muted = event.detail.muted;
        // Only a change made in this tab is saved for the others: a tab the
        // viewer is not using makes no changes of its own, and a volume
        // taken from another tab is that tab's (see `remoteVolumesRef`).
        const now = performance.now();
        remoteVolumesRef.current = remoteVolumesRef.current.filter(
          (entry) => entry.until > now,
        );
        const thisTabInUse =
          typeof document === "undefined" || document.hasFocus();
        const volumeFromAnotherTab = remoteVolumesRef.current.some(
          (entry) => Math.abs(entry.volume - event.detail.volume) < 0.001,
        );
        if (playbackPrefsAppliedRef.current) {
          playerPrefsRef.current.volume = event.detail.volume;
        }
        if (preferencesReadyRef.current && thisTabInUse) {
          writeMutedPreference(event.detail.muted);
          if (playbackPrefsAppliedRef.current && !volumeFromAnotherTab) {
            writeVolumePreference(event.detail.volume);
            publishLearningPlayerBootstrap({
              muted: event.detail.muted,
              volume: event.detail.volume,
            });
          } else {
            publishLearningPlayerBootstrap({ muted: event.detail.muted });
          }
        }
      } else if (event.type === "ratechange") {
        playerPrefsRef.current.playbackRate = event.detail.playbackRate;
        writePlaybackRatePreference(event.detail.playbackRate);
        publishLearningPlayerBootstrap({
          playbackRate: event.detail.playbackRate,
        });
      } else if (event.type === "texttrackchange") {
        captionsEnabledRef.current = event.detail.track !== null;
      } else if (event.type === "trackschanged") {
        // Subtitles are added once the video is ready, after `loaded`, so
        // captions left on in the previous lesson are turned on here.
        const { textTracks } = event.detail;
        if (
          captionsEnabledRef.current &&
          textTracks.length > 0 &&
          !textTracks.some((track) => track.active)
        ) {
          const preferredTrack =
            textTracks.find((track) => track.language === "en") ??
            textTracks[0]!;
          playerRef.current?.selectTextTrack(preferredTrack.id);
        }
      }
    },
    [
      finishMiniPlayerRestore,
      swipeHeldVolumeRef,
      mediaKey,
      playbackTelemetry,
      onLessonEnded,
      onProgressChange,
      onNearLessonEnd,
      trackWatchTime,
      persistResumePosition,
      playbackSuspended,
      showCompletionOverlay,
      showEndScreen,
      tryFinishPlayingMiniPlayerRestore,
    ],
  );

  const handleRestart = useCallback(() => {
    setShowEndScreen(false);
    setAutoplayCancelled(false);
    const player = playerRef.current;
    if (!player) return;
    latestPositionRef.current = 0;
    clearResumePosition(activeMediaKeyRef.current);
    player.seekTo(0);
    void player.play().catch(() => undefined);
  }, []);

  const dismissEndScreen = useCallback(() => {
    quizOfferedBeforeEndRef.current = false;
    setShowEndScreen(false);
  }, []);

  // Cancelling the countdown closes the end screen altogether: the video is
  // left as it is, paused where it ended, with its controls. The next ending
  // counts down again.
  const cancelEndScreenAutoplay = useCallback(() => {
    quizOfferedBeforeEndRef.current = false;
    setAutoplayCancelled(true);
    setShowEndScreen(false);
  }, []);

  const handleGoNextFromEndScreen = useCallback(() => {
    quizOfferedBeforeEndRef.current = false;
    setShowEndScreen(false);
    setAutoplayCancelled(false);
    goToNextLesson();
  }, [goToNextLesson]);

  const handleAttemptQuizFromEndScreen = useCallback(() => {
    quizOfferedBeforeEndRef.current = false;
    setShowEndScreen(false);
    setAutoplayCancelled(false);
    onAttemptQuiz?.();
  }, [onAttemptQuiz]);

  const minimizePlayer = useCallback(() => {
    if (!onMinimize) return;
    const snapshot = playerRef.current?.getSnapshot();
    if (snapshot?.ui.fullscreen) return;
    const currentTime =
      snapshot?.media.currentTime ?? latestPositionRef.current;
    latestPositionRef.current = currentTime;
    persistResumePosition(true);
    onMinimize({
      currentTime,
      lessonTitle,
      courseTitle,
      lessonIndex,
      totalLessons,
      mediaKey,
      muted: snapshot?.media.muted ?? muted,
      playbackRate: snapshot?.media.playbackRate ?? 1,
      playing: snapshot?.media.playing ?? false,
      source: { ...source, startTime: currentTime },
      volume: snapshot?.media.volume ?? 1,
      reading: playbackAccessError?.article
        ? { article: playbackAccessError.article, ...getLessonReadingFrame() }
        : undefined,
      getLivePlaybackSnapshot: () => {
        const liveSnapshot = playerRef.current?.getSnapshot().media;
        return {
          currentTime: liveSnapshot?.currentTime ?? latestPositionRef.current,
          muted: liveSnapshot?.muted ?? muted,
          playbackRate: liveSnapshot?.playbackRate ?? 1,
          playing: liveSnapshot?.playing ?? false,
          volume: liveSnapshot?.volume ?? 1,
        };
      },
      preparePlaybackHandoff: () => {
        handoffMutingRef.current = true;
        playerRef.current?.setMuted(true);
      },
    });
  }, [
    lessonTitle,
    mediaKey,
    muted,
    onMinimize,
    persistResumePosition,
    playbackAccessError?.article,
    source,
  ]);

  const minimizeGesture = useLessonPlayerMinimizeGesture({
    enabled: presentation === "full" && Boolean(onMinimize),
    fullscreen: () => playerRef.current?.getSnapshot().ui.fullscreen ?? false,
    motionTarget: minimizeMotionTarget,
    onCommit: minimizePlayer,
    onGestureStart: onMinimizeGestureStart,
    onSettlingMiniPress: onMiniRestore,
    onStateChange: onMinimizeGestureChange,
    preserveTerminalStateOnDisable: presentation === "mini",
  });

  const minimizePlayerFromControl = useCallback(async () => {
    if (!onMinimize) return;
    const player = playerRef.current;
    if (player?.getSnapshot().ui.fullscreen) {
      try {
        await player.exitFullscreen();
      } catch {
        return;
      }
    }
    minimizeGesture.animateMinimize();
  }, [minimizeGesture, onMinimize]);

  // A reading lesson stands where the video would, on the surface of a
  // lesson with no video, and goes full screen on its own.
  const readingSurfaceRef = useRef<HTMLDivElement>(null);
  const hasReading =
    presentation === "full" && Boolean(playbackAccessError?.article);
  const readingFullscreen = useLessonReadingFullscreen(
    readingSurfaceRef,
    hasReading,
  );
  // A tap on a reading's text puts its controls away, as a tap on a video
  // does, and the next brings them back. With a mouse they follow the
  // pointer instead: shown while it is over the reading, put away when it
  // leaves, as a video's are.
  const [readingControlsHidden, setReadingControlsHidden] = useState(false);
  const toggleReadingControls = useCallback(
    () => setReadingControlsHidden((hidden) => !hidden),
    [],
  );
  const exitReadingFullscreen = readingFullscreen.exit;
  // A reading in full screen on a touch screen held sideways shows its
  // lessons beside it, in the panel a video has there (see
  // `readingLessonsPanelVisible`). Anywhere else the lessons open where a
  // video's Lessons button opens them (the page's course column, or its
  // drawer), which a reading in full screen would cover, so the reading
  // leaves full screen first.
  const readingLessonsBeside = readingFullscreen.landscapeOnTouch;
  const toggleLessonsFromReading = useCallback(async () => {
    if (readingLessonsBeside) {
      onCourseLessonsToggle?.("side");
      return;
    }
    await exitReadingFullscreen();
    onCourseLessonsToggle?.(courseLessonsSidePanel ? "side" : "drawer");
  }, [
    courseLessonsSidePanel,
    exitReadingFullscreen,
    onCourseLessonsToggle,
    readingLessonsBeside,
  ]);
  const minimizeReadingFromControl = useCallback(async () => {
    await exitReadingFullscreen();
    void minimizePlayerFromControl();
  }, [exitReadingFullscreen, minimizePlayerFromControl]);

  useLearningPlayerMinimizeShortcut({
    enabled: presentation === "full" && Boolean(onMinimize),
    onTrigger: () => {
      void (hasReading
        ? minimizeReadingFromControl()
        : minimizePlayerFromControl());
    },
  });

  const minimizeFromControlRef = useRef(minimizePlayerFromControl);
  minimizeFromControlRef.current = minimizePlayerFromControl;
  useEffect(() => {
    if (!onMinimizeTriggerReady) return undefined;
    onMinimizeTriggerReady(() => {
      void minimizeFromControlRef.current();
    });
    return () => onMinimizeTriggerReady(null);
  }, [onMinimizeTriggerReady]);

  const handleAmbientEnabledChange = useCallback((enabled: boolean) => {
    setAmbientEnabled(enabled);
    writeAmbientPreference(enabled);
  }, []);

  // A transition, as the turn that sets it (see useLandscapeOrientation in
  // LessonPlayerControls): the lesson page re-renders for it.
  const handleMobileLandscapeFullscreenChange = useCallback(
    (active: boolean) => {
      startTransition(() => {
        setMobileLandscapeFullscreen(active);
        onMobileLandscapeFullscreenChange?.(active);
      });
    },
    [onMobileLandscapeFullscreenChange],
  );

  // A reading turned sideways in full screen tells the page so, as a
  // video's controls do, and the page's Lessons toggle then opens the side
  // panel. There are no video controls to say it while a reading is up.
  useEffect(() => {
    if (!hasReading || !readingLessonsBeside) return undefined;
    handleMobileLandscapeFullscreenChange(true);
    return () => handleMobileLandscapeFullscreenChange(false);
  }, [handleMobileLandscapeFullscreenChange, hasReading, readingLessonsBeside]);

  const handleTheaterModeChange = useCallback(
    (active: boolean) => {
      if (active !== theaterMode) onTheaterToggle();
    },
    [onTheaterToggle, theaterMode],
  );

  useLayoutEffect(() => {
    const prefs = getInitialLearningPlayerPreferences();
    playerPrefsRef.current = prefs;
    setMuted(prefs.muted);

    if (restoreAutoplayRef.current !== null) return;
    const player = playerRef.current;
    if (!player) return;
    applyingPlaybackPrefsRef.current = true;
    try {
      player.setVolume(prefs.volume);
      player.setMuted(prefs.muted);
      player.setPlaybackRate(prefs.playbackRate);
    } finally {
      applyingPlaybackPrefsRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    if (restoreAutoplayRef.current !== null) return;
    playerRef.current?.setMuted(muted);
    publishLearningPlayerBootstrap({ muted });
  }, [muted, preferencesReady]);

  useEffect(() => {
    setAmbientEnabled(readAmbientPreference());
    preferencesReadyRef.current = true;
    setPreferencesReady(true);

    // Another tab's volume is applied a few times a second at most, the
    // latest one: a burst of changes from other tabs (a slider dragged
    // there, or older pages still sending volumes back and forth) must not
    // make this one apply and redraw hundreds of them a second.
    let pendingRemoteVolume: number | null = null;
    let remoteVolumeTimer: number | undefined;
    const applyRemoteVolume = () => {
      remoteVolumeTimer = undefined;
      const nextVolume = pendingRemoteVolume;
      pendingRemoteVolume = null;
      if (nextVolume === null) return;
      const now = performance.now();
      remoteVolumesRef.current = [
        ...remoteVolumesRef.current.filter((entry) => entry.until > now),
        { volume: nextVolume, until: now + REMOTE_VOLUME_ECHO_MS },
      ];
      if (playbackPrefsAppliedRef.current) {
        playerRef.current?.setVolume(nextVolume);
      }
    };
    const syncPreferences = (event: StorageEvent) => {
      if (event.key === lessonPlayerStorageKeys.muted) {
        const nextMuted = event.newValue === "true" || event.newValue === "on";
        setMuted(nextMuted);
        playerPrefsRef.current.muted = nextMuted;
      } else if (event.key === lessonPlayerStorageKeys.volumeChange) {
        // Only a change a viewer made in another tab moves this one; the
        // saved volume itself is not followed (see `volumeChange`).
        const nextVolume = readVolumeChange(event.newValue);
        if (nextVolume === null) return;
        playerPrefsRef.current.volume = nextVolume;
        pendingRemoteVolume = nextVolume;
        remoteVolumeTimer ??= window.setTimeout(
          applyRemoteVolume,
          REMOTE_VOLUME_APPLY_INTERVAL_MS,
        );
      } else if (event.key === lessonPlayerStorageKeys.playbackRate) {
        const nextRate = Number(event.newValue);
        if (!Number.isFinite(nextRate) || nextRate <= 0) return;
        playerPrefsRef.current.playbackRate = nextRate;
        playerRef.current?.setPlaybackRate(nextRate);
      } else if (event.key === lessonPlayerStorageKeys.ambient) {
        if (event.newValue === "on") setAmbientEnabled(true);
        if (event.newValue === "off") setAmbientEnabled(false);
      }
    };
    window.addEventListener("storage", syncPreferences);
    return () => {
      preferencesReadyRef.current = false;
      window.removeEventListener("storage", syncPreferences);
      window.clearTimeout(remoteVolumeTimer);
    };
  }, []);

  useEffect(() => {
    return () => persistResumePosition(true);
  }, [mediaKey, persistResumePosition]);

  useEffect(() => {
    const handleLessonNavigationShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])",
        )
      ) {
        return;
      }

      if (event.code === "KeyN" && canGoNext) {
        event.preventDefault();
        onGoNext();
      } else if (event.code === "KeyP" && canGoPrevious) {
        event.preventDefault();
        onGoPrevious();
      }
    };

    window.addEventListener("keydown", handleLessonNavigationShortcut);
    return () =>
      window.removeEventListener("keydown", handleLessonNavigationShortcut);
  }, [canGoNext, canGoPrevious, onGoNext, onGoPrevious]);

  const fullscreenCoursePanelActive =
    presentation === "full" &&
    mobileLandscapeFullscreen &&
    courseLessonsOpen &&
    Boolean(courseLessonsPanel);
  const playerShellStyle = fullscreenCoursePanelActive
    ? ({
        // The screen as the player sees it: a page full screen can turn the
        // player sideways on an upright phone (pageFullscreen.ts in the video
        // player), and then sets these to the turned size.
        "--learning-fullscreen-video-pane-width": `calc(var(--player-screen-width, 100dvw) * ${courseLessonsVideoWidthPercent} / 100)`,
        "--learning-fullscreen-video-width":
          "min(var(--learning-fullscreen-video-pane-width), calc(var(--player-screen-height, 100dvh) * 16 / 9))",
        "--learning-fullscreen-panel-offset-x":
          "max(0px, calc(var(--learning-fullscreen-video-pane-width) - var(--learning-fullscreen-video-width)))",
        "--learning-fullscreen-video-offset-x":
          "calc(var(--learning-fullscreen-panel-offset-x) / 2)",
      } as FullscreenCoursePanelStyle)
    : undefined;

  if (
    (playbackBootstrapPending && !holdingPreviousLesson) ||
    playbackAccessError
  ) {
    const MinimizeIcon = playerTheme.icons.minimize;
    const FullscreenEnterIcon = playerTheme.icons.fullscreenEnter;
    const FullscreenExitIcon = playerTheme.icons.fullscreenExit;
    const isPending = !playbackAccessError;
    // A failure and a plain statement are both words on the bare stage; the
    // lock, the lesson's picture and the prominent action are for a lesson
    // that is waiting for the learner to sign in or to get the course.
    const isPlainGate =
      playbackAccessError?.kind === "retry" ||
      playbackAccessError?.kind === "notice";
    const reading =
      presentation === "full" ? playbackAccessError?.article : undefined;
    // Minimized, a reading shows its text as a small picture, as a video
    // shows its frame.
    const miniReading =
      presentation === "mini" ? playbackAccessError?.article : undefined;
    const readingLessonsPanelVisible =
      Boolean(reading) &&
      readingLessonsBeside &&
      courseLessonsOpen &&
      Boolean(courseLessonsPanel);
    const gateIllustration =
      presentation === "full" &&
      (playbackAccessError?.kind === "retry" ||
        playbackAccessError?.kind === "notice")
        ? playbackAccessError.illustration
        : undefined;
    const gateTitle = !playbackAccessError
      ? ""
      : playbackAccessError.kind === "login"
        ? // Signing in is the whole message here, so it stands alone.
          playbackAccessError.message
        : (playbackAccessError.title ??
          (playbackAccessError.kind === "access"
            ? "Ready to dive in?"
            : "Something went wrong"));
    return (
      <div
        // While the window is in motion (minimizing, turning back, or
        // expanding again) it is scaled as one picture, and whatever is
        // drawn on it shrinks with it: the minimize control, a message.
        // So everything on the shell is hidden for exactly that stretch, as
        // the playing video's controls are, and only the black surface
        // travels. The motion marks the host (`learningPlayerMotion.ts`).
        //
        // A surface with no video on it is swiped down into the mini player
        // exactly as a playing one is: it takes the same gesture, keeps the
        // vertical swipe from the page on touch screens as the player does,
        // and is the same kind of surface to the motion.
        className={cn(
          // A reading is the exception: its text travels with the window,
          // as a video's picture does (`LessonReadingStage` hides its
          // button).
          "video-shell relative isolate aspect-video w-full overflow-hidden bg-black shadow-[0_18px_50px_rgba(0,0,0,.22)] [[data-learning-player-restore-phase=expanding]_&]:[&>:not([data-lesson-reading-scroll])]:invisible! [[data-learning-player-window-motion]_&]:[&>:not([data-lesson-reading-scroll])]:invisible!",
          presentation === "full" &&
            "touch-pan-x touch-pinch-zoom min-[641px]:[@media(pointer:fine)]:touch-pan-y",
          // Under a finger the surface is moved by the gesture itself, which
          // sets no mark on the host; it says so here instead.
          minimizeGesture.controlsSuppressed &&
            "[&>:not([data-lesson-reading-scroll])]:invisible!",
          (reading || miniReading) && lessonReadingShellClasses,
        )}
        ref={reading ? readingSurfaceRef : undefined}
        // The reading, its controls and the lessons panel share the width
        // as a video and the panel do: the panel takes what the video's
        // resizable split leaves.
        style={
          readingLessonsPanelVisible
            ? ({
                "--lesson-reading-panel-width": `${100 - courseLessonsVideoWidthPercent}dvw`,
              } as CSSProperties)
            : undefined
        }
        data-learning-playback-gate={playbackAccessError?.kind ?? "pending"}
        data-lesson-reading-moving={
          reading && minimizeGesture.controlsSuppressed ? "" : undefined
        }
        data-learning-player-motion-surface=""
        {...(presentation === "full" ? minimizeGesture.handlers : {})}
        onPointerEnter={
          reading
            ? (event) => {
                if (event.pointerType === "mouse") {
                  setReadingControlsHidden(false);
                }
              }
            : undefined
        }
        onPointerLeave={
          reading
            ? (event) => {
                if (event.pointerType === "mouse") {
                  setReadingControlsHidden(true);
                }
              }
            : undefined
        }
        // A keyboard reaching the reading finds its controls there.
        onFocusCapture={
          reading ? () => setReadingControlsHidden(false) : undefined
        }
        role={
          isPending
            ? "status"
            : playbackAccessError.kind === "notice"
              ? undefined
              : "alert"
        }
        aria-label={isPending ? "Loading video" : undefined}
      >
        {/* A lesson that is waiting for the learner (to sign in, to get the
            course) shows what it is: its own picture, dimmed and out of
            focus behind the message, instead of an empty black screen. */}
        {playbackAccessError && !isPlainGate && media.thumbnailSrc ? (
          <LessonPictureBackdrop src={media.thumbnailSrc} />
        ) : null}
        {/* A failure with a drawing stands on the lit stage a failed video
            does, not on bare black. */}
        {gateIllustration ? <LessonPictureBackdrop /> : null}
        {reading ? (
          <LessonReadingStage
            article={reading}
            minimizeControl={
              onMinimize ? (
                <LessonPlayerMinimizeControl
                  icon={<MinimizeIcon size={22} />}
                  onMinimize={minimizeReadingFromControl}
                />
              ) : undefined
            }
            clearBottom
            controlsHidden={readingControlsHidden}
            onTap={toggleReadingControls}
          />
        ) : presentation === "full" && onMinimize ? (
          <LessonPlayerMinimizeControl
            icon={<MinimizeIcon size={22} />}
            onMinimize={minimizePlayerFromControl}
          />
        ) : null}
        {reading ? (
          <PlayerThemeProvider theme={playerTheme}>
            <LessonReadingNavigationControls
              canGoNext={canGoNext}
              canGoPrevious={canGoPrevious}
              hidden={readingControlsHidden}
              showLessonNavigation={showLessonNavigation}
              style={getPlayerThemeStyle(playerTheme)}
              onGoNext={onGoNext}
              onGoPrevious={onGoPrevious}
            />
            <LessonReadingFullscreenControls
              hidden={readingControlsHidden}
              lessonsButton={
                onCourseLessonsToggle ? (
                  <CourseLessonsButton
                    open={
                      readingLessonsBeside || courseLessonsSidePanel
                        ? courseLessonsOpen
                        : courseLessonsDrawerOpen
                    }
                    onToggle={() => void toggleLessonsFromReading()}
                    shortcutLabel={courseLessonsShortcutLabel}
                    sidePanel={readingLessonsBeside || courseLessonsSidePanel}
                    opensFromBottom={
                      !readingLessonsBeside &&
                      !courseLessonsSidePanel &&
                      courseLessonsBottomSheet
                    }
                    textSize="sm"
                    scrollportId={
                      readingLessonsBeside
                        ? "learning-fullscreen-course-curriculum-scrollport"
                        : courseLessonsSidePanel
                          ? "learning-course-curriculum-scrollport"
                          : "lesson-drawer-curriculum-scrollport"
                    }
                  />
                ) : undefined
              }
              readingFullscreen={readingFullscreen}
              style={getPlayerThemeStyle(playerTheme)}
              enterIcon={<FullscreenEnterIcon size={23} />}
              exitIcon={<FullscreenExitIcon size={23} />}
            />
          </PlayerThemeProvider>
        ) : null}
        {presentation === "mini" ? (
          // The window's own expand and close, as on a playing video. There
          // is no player around them here, so they are told its theme.
          <PlayerThemeProvider theme={playerTheme}>
            <MiniPlayerWindowControls
              onClose={onMiniClose ?? (() => undefined)}
              onRestore={onMiniRestore ?? (() => undefined)}
            />
          </PlayerThemeProvider>
        ) : null}
        {readingLessonsPanelVisible ? (
          <div className="absolute inset-y-0 right-0 z-40 flex w-(--lesson-reading-panel-width)">
            {courseLessonsPanel}
          </div>
        ) : null}
        {miniReading ? <LessonReadingMiniature article={miniReading} /> : null}
        {playbackAccessError &&
        !miniReading &&
        (presentation === "mini" || !isPlainGate) ? (
          // The mini window is a few lines tall: it says what is wrong in
          // one line and keeps the action, sized to fit, between the
          // window's tap-to-expand surface and its buttons. The longer
          // explanation and the link are the full player's.
          //
          // Signing in, and joining the course, are one line and one action
          // at every size, so the full player uses the same notice for
          // them, which fits itself to
          // the player's height: a smaller lock, then none, and smaller
          // type, before the action could be cut off.
          <VideoPlayerNotice
            className="z-20"
            title={gateTitle}
            icon={
              presentation === "full" ? (
                <span className="grid size-14 place-items-center rounded-full bg-white/12 ring-1 ring-white/20 backdrop-blur-sm">
                  <LockKey size={28} weight="fill" aria-hidden="true" />
                </span>
              ) : undefined
            }
            smallIcon={
              presentation === "full" ? (
                <span className="grid size-8 place-items-center rounded-full bg-white/12 ring-1 ring-white/20 [@container_(min-height:10.5rem)]:size-10">
                  <LockKey size={18} weight="fill" aria-hidden="true" />
                </span>
              ) : undefined
            }
            action={
              playbackAccessError.onAction
                ? {
                    label: playbackAccessError.actionLabel,
                    prominent: playbackAccessError.kind !== "retry",
                    onSelect: playbackAccessError.onAction,
                  }
                : undefined
            }
          />
        ) : reading || miniReading ? null : (
          <div className="[container-type:size] pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-white">
            {isPending ? (
              <VideoLoadingSpinner />
            ) : (
              <div className="relative z-20 max-w-md space-y-4">
                {/* Drawn only where the player is tall enough to keep the
                    message and its action whole under it. A notice has no
                    action, so it keeps the drawing in a shorter player. */}
                {gateIllustration ? (
                  // The drawing sets its own display, so the box around it
                  // is what comes and goes.
                  playbackAccessError.onAction || playbackAccessError.link ? (
                    <div className="hidden [@container_(min-height:17rem)]:block">
                      <OctopusIllustration
                        kind={gateIllustration}
                        surface="dark"
                        className="mx-auto h-[clamp(4.5rem,calc(100cqh_-_13rem),9rem)] w-auto"
                      />
                    </div>
                  ) : (
                    <div className="hidden [@container_(min-height:10.5rem)]:block">
                      <OctopusIllustration
                        kind={gateIllustration}
                        surface="dark"
                        className="mx-auto h-[clamp(3.5rem,calc(100cqh_-_8rem),9rem)] w-auto"
                      />
                    </div>
                  )
                ) : null}
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">{gateTitle}</h2>
                  <p className="text-sm text-white/70">
                    {playbackAccessError.message}
                  </p>
                </div>
                {playbackAccessError.onAction ? (
                  <button
                    type="button"
                    className="pointer-events-auto mx-auto inline-flex min-h-10 items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    onClick={playbackAccessError.onAction}
                  >
                    {playbackAccessError.actionLabel}
                  </button>
                ) : null}
                {playbackAccessError.link ? (
                  <a
                    href={playbackAccessError.link.href}
                    className="pointer-events-auto mx-auto block w-fit text-sm font-medium text-white/80 underline underline-offset-4 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {playbackAccessError.link.label}
                  </a>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!playbackMedia.src && !holdingPreviousLesson) {
    // API lessons have no playable source until their playback bootstrap
    // resolves. Show the lesson poster instead of handing the engine an
    // empty URL or a placeholder video, and the failure when loading failed.
    return (
      <div
        role={playbackUnavailableMessage ? "alert" : "img"}
        aria-label={
          playbackUnavailableMessage
            ? undefined
            : `Preparing video for ${lessonTitle}`
        }
        className="relative aspect-video w-full overflow-hidden bg-black"
      >
        {media.thumbnailSrc ? (
          <img
            src={media.thumbnailSrc}
            alt=""
            decoding="async"
            className={cn(
              "h-full w-full object-cover",
              playbackUnavailableMessage && "opacity-30",
            )}
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
        {playbackUnavailableMessage ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="m-0 max-w-sm text-[0.86rem] font-semibold text-white">
              {playbackUnavailableMessage}
            </p>
            {onRetryPlayback ? (
              <button
                type="button"
                onClick={onRetryPlayback}
                className="inline-flex h-10 items-center justify-center rounded-[10px] border-none bg-(--accent) px-5 text-[0.82rem] font-bold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all duration-150 hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-(--accent)"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // The end screen is a dialog over the video, drawn inside the player. The
  // timeline and the controls are drawn in the shell around it, a layer
  // above anything inside the player. The timeline and the bottom row stay
  // up over it, and its words and buttons sit above them (`controlsInset`),
  // so the learner can scrub back or press play from it; the top row stands
  // down for its close button. Dragging the timeline closes it. The mini
  // window keeps it, small, with its countdown standing still.
  const endScreenVisible =
    (presentation === "mini" ||
      (presentation === "full" && !minimizeGesture.controlsSuppressed)) &&
    showCompletionOverlay &&
    showEndScreen;
  const chromeSuppressed = minimizeGesture.controlsSuppressed;

  if (!holdingPreviousLesson) {
    lastPlayableRef.current = {
      source,
      mediaKey,
      description,
      chapterThumbnails,
      spriteStoryboardUrl: playbackBootstrap?.storyboardUrl,
    };
  }
  const playerPlayback = lastPlayableRef.current ?? {
    source,
    mediaKey,
    description,
    chapterThumbnails,
    spriteStoryboardUrl: playbackBootstrap?.storyboardUrl,
  };
  const playerSource = playerPlayback.source;

  return (
    <VeoVideoPlayer
      ref={playerRef}
      source={playerSource}
      description={playerPlayback.description ?? undefined}
      chapterThumbnails={playerPlayback.chapterThumbnails}
      spriteStoryboardUrl={playerPlayback.spriteStoryboardUrl}
      theme={playerTheme}
      engine="shaka"
      engineFactory={engineFactory}
      autoPlay={
        playbackPaused
          ? false
          : autoPlayOnMediaChange || restoreAutoplayRef.current === true
      }
      keyboardEnabled={presentation === "full" && !playbackPaused}
      zoomEnabled={presentation === "full"}
      zoomOverflowBoundary={
        presentation === "full" && mobileLandscapeFullscreen
          ? "shell"
          : "player"
      }
      ariaLabel={`Lesson video player for ${lessonTitle}`}
      theaterMode={theaterMode}
      onTheaterModeChange={handleTheaterModeChange}
      shortcuts={LESSON_PLAYER_SHORTCUTS}
      seekIntervalSeconds={seekIntervalSeconds}
      emptyTapBehavior="responsive"
      controlsIdleDelay={LESSON_PLAYER_CONTROLS_IDLE_DELAY_MS}
      controlsTouchIdleDelay={LESSON_PLAYER_CONTROLS_TOUCH_IDLE_DELAY_MS}
      keepControlsVisibleUntilFirstPlay
      keepPosterVisibleUntilFirstPlay
      onEvent={handleEvent}
      // In the mini window the controls draw a failure under their own
      // expand and close. The full player says it where its loader turns,
      // in the middle, and nothing more: no screen over the player, so the
      // controls around it are seen clearly and stay in use (lessons,
      // settings, minimize, full screen), and it takes only the presses on
      // its own action.
      errorOverlay={
        presentation === "mini" ? (
          false
        ) : (
          <PlayerErrorNotice
            source={playerSource}
            backdrop={false}
            // The lesson's own picture behind the message, as on the
            // surface that asks the learner to sign in.
            background={
              <>
                <LessonPictureBackdrop src={media.thumbnailSrc} followTheme />
                <FailedPlayerSizeMark />
              </>
            }
            // Under the controls' layer (z-30), so the picture behind the
            // message does not dim the controls that lie over it.
            backgroundClassName="z-20"
            // The message itself is laid out in what the controls leave
            // free: below the top row and above the timeline and the
            // bottom row. A shorter player draws the picture smaller and
            // then not at all, before the action would reach a control;
            // and the action is above the controls, should it ever.
            // The top row's controls are in the corners and the message
            // is in the middle, so its room starts a little above their
            // lower edge.
            contentClassName="z-40 top-9! bottom-20!"
            // The drawing takes whatever height the title and the action
            // leave in that room (`cqh` is the room's own height), so it is
            // as large as the player allows at every size: 5rem to 10rem
            // here, and 2rem to 6rem in the shorter room the smaller
            // drawing is for. What is taken off is the notice's own
            // padding, gaps, title and action at that size, and 8px to
            // spare.
            icon={
              <LessonTroubleIllustration className="h-[clamp(5rem,calc(100cqh_-_9.75rem),10rem)] w-auto" />
            }
            smallIcon={
              <LessonTroubleIllustration className="h-8 w-auto [@container_(min-height:10.5rem)]:h-[clamp(3rem,calc(100cqh_-_7.5rem),6rem)]" />
            }
          />
        )
      }
      lockLandscapeOnFullscreen
      mediaProps={{
        muted: restoreAutoplayRef.current !== null ? true : muted,
        // A hovered or next lesson is prepared in a hidden second element
        // and switched to at once when opened.
        withStandby: true,
      }}
      className={cn(
        // A failure's message is drawn on the video, and the window is
        // scaled as one picture while it minimizes, turns back or expands.
        // So the message is hidden for that stretch, as the surface with no
        // video hides what is on it, and under a finger too.
        // A failed player too short for its controls drops them, and the
        // message takes the whole of it (`FailedPlayerSizeMark`).
        "data-learning-player-failed-small:[&_:is([data-video-player-control-layer],[data-player-bottom-corner-controls-layer],[data-player-timeline-wrap])]:invisible! data-learning-player-failed-small:[&_[data-video-player-notice-content]]:inset-0!",
        failedByDayClasses,
        "[[data-learning-player-restore-phase=expanding]_&]:[&_[data-video-player-notice]]:invisible! [[data-learning-player-window-motion]_&]:[&_[data-video-player-notice]]:invisible! data-learning-player-controls-suppressed:[&_[data-video-player-notice]]:invisible!",
        // Wide touch screens keep the vertical swipe for the minimize
        // gesture, as phones do; only a mouse-first device hands vertical
        // panning back to the page. The tap surface inside allows vertical
        // panning by itself at these widths, so it is told the same.
        presentation === "full" &&
          "touch-pan-x touch-pinch-zoom min-[641px]:[@media(pointer:fine)]:touch-pan-y [@media(pointer:coarse)]:[&_[data-player-zoom-surface]]:touch-none!",
        presentation === "mini"
          ? MINI_PLAYER_VIDEO_SHELL_CLASS
          : fullscreenCoursePanelActive
            ? "flex h-full items-center justify-start overflow-hidden bg-black"
            : undefined,
      )}
      data-learning-player-controls-suppressed={
        minimizeGesture.controlsSuppressed ? "" : undefined
      }
      data-learning-player-motion-surface=""
      style={playerShellStyle}
      {...(presentation === "full" ? minimizeGesture.handlers : {})}
      playerClassName={
        presentation === "mini"
          ? `${MINI_PLAYER_VIDEO_CORNERS_CLASS} !shadow-none`
          : fullscreenCoursePanelActive
            ? cn(
                "border-0 !h-auto !max-h-full !w-(--learning-fullscreen-video-width) !max-w-none !translate-x-(--learning-fullscreen-video-offset-x) !shrink-0 !rounded-none !shadow-none [[data-fullscreen-lessons-beside=wide]_&]:!h-full [[data-fullscreen-lessons-beside=wide]_&]:!aspect-auto",
                // Full screen with the lessons beside it, the video's pane
                // is taller than the picture: with ambient mode on, the
                // bands above and below it show the glow behind (the
                // full-screen projection, LessonAmbientProjection), not
                // black. The zoom layers the video lies in (PlayerZoomMedia)
                // are black of their own, so they go see-through too.
                ambientEnabled &&
                  "!bg-transparent [&_[data-player-zoom-viewport]]:!bg-transparent [&_[data-player-zoom-media-plane]]:!bg-transparent",
              )
            : "border-0 !rounded-none"
      }
      mediaClassName={
        presentation === "mini"
          ? MINI_PLAYER_VIDEO_CORNERS_CLASS
          : fullscreenCoursePanelActive && ambientEnabled
            ? "!bg-transparent"
            : undefined
      }
      centralControl={
        presentation === "mini" ? (
          false
        ) : (
          <LessonCentralControls
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            controlsSuppressed={chromeSuppressed}
            onGoNext={onGoNext}
            onGoPrevious={onGoPrevious}
          />
        )
      }
      controls={
        presentation === "mini" ? (
          <MiniPlayerControls
            lessonTitle={lessonTitle}
            courseTitle={courseTitle}
            lessonIndex={lessonIndex}
            totalLessons={totalLessons}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            onGoNext={onGoNext}
            onGoPrevious={onGoPrevious}
            onClose={onMiniClose ?? (() => undefined)}
            onRestore={onMiniRestore ?? (() => undefined)}
            source={playerSource}
            endScreenOpen={endScreenVisible}
          />
        ) : (
          <LessonPlayerControls
            shortPlayer={shortPlayer && presentation === "full"}
            seekTimeOnly={seekTimeOnly && presentation === "full"}
            ambientEnabled={ambientEnabled}
            autoplayEnabled={autoplayEnabled}
            showAutoplayControl={showAutoplayControl}
            circularSettingsControl={circularSettingsControl}
            showLessonNavigation={showLessonNavigation}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            controlsSuppressed={chromeSuppressed}
            endScreenOpen={endScreenVisible}
            onEndScreenDismiss={dismissEndScreen}
            courseLessonsOpen={courseLessonsOpen}
            courseLessonsDrawerOpen={courseLessonsDrawerOpen}
            courseLessonsPanel={courseLessonsPanel}
            courseLessonsSecondPressHold={courseLessonsSecondPressHold}
            courseLessonsShortcutLabel={courseLessonsShortcutLabel}
            courseLessonsSidePanel={courseLessonsSidePanel}
            courseLessonsBottomSheet={courseLessonsBottomSheet}
            lessonTitle={lessonTitle}
            chaptersPanelHost={chaptersPanelHost}
            onAmbientEnabledChange={handleAmbientEnabledChange}
            onAutoplayEnabledChange={onAutoplayEnabledChange}
            onCourseLessonsToggle={onCourseLessonsToggle}
            onGoNext={onGoNext}
            onGoPrevious={onGoPrevious}
            onMinimize={onMinimize ? minimizePlayerFromControl : undefined}
            onMobileLandscapeFullscreenChange={
              handleMobileLandscapeFullscreenChange
            }
          />
        )
      }
      overlays={
        <>
          {holdingPreviousLesson ? (
            // The same waiting surface the player used to be replaced with:
            // black over the held lesson, with the loader, above the controls.
            // In full screen the controls stay above it, so the learner can
            // still leave full screen or pick another lesson.
            <div
              className={cn(
                "absolute inset-0 grid place-items-center bg-black",
                playerFullscreen ? "pointer-events-none z-20" : "z-50",
              )}
              role="status"
              aria-label="Loading video"
              data-learning-playback-gate="pending"
            >
              <VideoLoadingSpinner />
            </div>
          ) : presentation === "full" && !minimizeGesture.controlsSuppressed ? (
            <LessonAmbientProjection enabled={ambientEnabled} />
          ) : undefined}
          {/* In the same place for both presentations, so minimizing keeps
              the countdown where it was instead of starting it again. */}
          {!holdingPreviousLesson && endScreenVisible ? (
            <LessonEndScreenOverlay
              nextLesson={
                canGoNext
                  ? (nextLessonInfo ?? { id: 0, title: "Next lesson" })
                  : undefined
              }
              autoplayEnabled={autoplayEnabled && !autoplayCancelled}
              courseComplete={courseComplete}
              onGoNext={handleGoNextFromEndScreen}
              onRestart={handleRestart}
              onCancelAutoplay={cancelEndScreenAutoplay}
              quiz={
                lessonQuizOffered
                  ? { onAttempt: handleAttemptQuizFromEndScreen }
                  : undefined
              }
              onClose={dismissEndScreen}
              controlsInset={presentation === "full"}
              minimized={presentation === "mini"}
            />
          ) : null}
        </>
      }
      playbackFeedback={
        presentation === "mini" || minimizeGesture.controlsSuppressed
          ? false
          : undefined
      }
      bufferingIndicator={<LearningMiniPlayerBufferingIndicator />}
    />
  );
}
