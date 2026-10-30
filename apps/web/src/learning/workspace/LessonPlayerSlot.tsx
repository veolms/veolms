import type { RefObject, Dispatch, SetStateAction } from "react";
import type { CSSProperties } from "react";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { LessonVideoPlayer } from "../player/LessonVideoPlayer";
import { LessonPlayerChromePlaceholder } from "../player/LessonPlayerChromePlaceholder";
import type {
  LessonVideoPlayerProps,
  RegisterPersistentLearningPlayer,
} from "../player";
import {
  LESSON_PLAYER_COMPACT_HEIGHT,
  LESSON_PLAYER_GROWTH_PROPERTY,
  LESSON_PLAYER_MAX_HEIGHT_PROPERTY,
  LESSON_PLAYER_TINY_HEIGHT,
  LessonPlayerHeightHandle,
  ReadingFullHeightGuide,
} from "../player/LessonPlayerHeightHandle";
import {
  QuizAttemptPanel,
  QuizStageMessage,
} from "../../quizzes/QuizAttemptPanel";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";
import type { MyQuizAssignment } from "@veolms/contracts";
import type { useCourseQuizAssignments } from "../../services/quizzes/quizzes.queries";

export interface LessonPlayerSlotProps {
  playerWrapRef: RefObject<HTMLDivElement | null>;
  stickyPlayer: boolean;
  showingQuiz: boolean;
  currentQuizAssignment:
    | MyQuizAssignment
    | {
        id: string;
        courseId: string;
        quizTitle: string;
        maxAttempts: number;
        activeAttemptId: null;
        attemptCount: number;
        bestScore: null;
        latestPassed: null;
      }
    | null;
  currentLessonUuid: string | undefined;
  selectedLesson: number;
  courseId: string | undefined;
  resumeLessonVideoPlayback: () => void;
  updateSelectedLessonProgress: (progress: number) => void;
  nextLessonId: number | undefined;
  onSelectLesson: (lessonId: number, view?: "video" | "quiz") => void;
  quizAssignmentLoading: boolean;
  courseQuizAssignments: ReturnType<typeof useCourseQuizAssignments>;
  isDedicatedQuizLesson: boolean;
  hasLessonQuiz: (lessonNumber: number) => boolean;
  registerPersistentPlayer: RegisterPersistentLearningPlayer | undefined;
  appliedReadingGrowth: number | null;
  appliedPlayerHeight: number | null;
  shortPlayer: boolean;
  seekTimeOnly: boolean;
  persistentPlayerMounted: boolean;
  lessonPlayerProps: LessonVideoPlayerProps;
  playerHeight: number | null;
  setPlayerHeight: (next: number | null) => void;
  readingGrowable:
    | {
        growth: number | null;
        onGrowthChange: Dispatch<SetStateAction<number | null>>;
      }
    | undefined;
}

export function LessonPlayerSlot({
  playerWrapRef,
  stickyPlayer,
  showingQuiz,
  currentQuizAssignment,
  currentLessonUuid,
  selectedLesson,
  courseId,
  resumeLessonVideoPlayback,
  updateSelectedLessonProgress,
  nextLessonId,
  onSelectLesson,
  quizAssignmentLoading,
  courseQuizAssignments,
  isDedicatedQuizLesson,
  hasLessonQuiz,
  registerPersistentPlayer,
  appliedReadingGrowth,
  appliedPlayerHeight,
  shortPlayer,
  seekTimeOnly,
  persistentPlayerMounted,
  lessonPlayerProps,
  playerHeight,
  setPlayerHeight,
  readingGrowable,
}: LessonPlayerSlotProps) {
  // prettier-ignore
  return (
    <div
      ref={playerWrapRef}
      // A video at its full height scrolls away with the page. Once
      // the viewer has resized it (the grip, or the title on a touch
      // screen) it stays at the top while the title and description
      // scroll away beneath it. The grip marks the slot inside while
      // it is dragged, before the new height is saved, so the rule
      // reads that mark. The player itself is positioned on this slot,
      // so it follows. The slot sits above the page that scrolls
      // behind it, so the strip that resizes the video is never
      // covered. It never shrinks: on a phone its column scrolls, and the
      // overflow a minimize swipe puts on it would otherwise let it shrink
      // to nothing, hiding the player positioned on it mid-swipe.
      className={`learning-workspace__player-wrap shrink-0 ${stickyPlayer ? "z-40 has-[[data-learning-player-shortened]]:sticky! has-[[data-learning-player-shortened]]:top-0" : ""}`}
      data-learning-player-motion-target=""
    >
      {showingQuiz ? (
        // The quiz takes the video's place edge to edge, as the video
        // does. It used to sit in a padded box holding a second card.
        <div className="w-full min-w-0">
          {currentQuizAssignment ? (
            <QuizAttemptPanel
              key={`${currentQuizAssignment.id}-${currentLessonUuid ?? selectedLesson}`}
              assignmentId={currentQuizAssignment.id}
              courseId={courseId ?? currentQuizAssignment.courseId}
              quizTitle={currentQuizAssignment.quizTitle}
              activeAttemptId={currentQuizAssignment.activeAttemptId}
              maxAttempts={currentQuizAssignment.maxAttempts}
              attemptCount={currentQuizAssignment.attemptCount}
              bestScore={currentQuizAssignment.bestScore}
              latestPassed={currentQuizAssignment.latestPassed}
              onBackToVideo={resumeLessonVideoPlayback}
              onPassed={() => updateSelectedLessonProgress(100)}
              lessonBadge={`Lesson ${selectedLesson} Quiz`}
              onContinueCourse={
                nextLessonId === undefined
                  ? undefined
                  : () => {
                      resumeLessonVideoPlayback();
                      onSelectLesson(nextLessonId);
                    }
              }
            />
          ) : (
            <QuizStageMessage
              lessonBadge={`Lesson ${selectedLesson} Quiz`}
              onBackToVideo={resumeLessonVideoPlayback}
              role={
                quizAssignmentLoading || courseQuizAssignments.isLoading
                  ? "status"
                  : "alert"
              }
              label={
                quizAssignmentLoading || courseQuizAssignments.isLoading
                  ? "Loading quiz assignment"
                  : undefined
              }
              visual={
                quizAssignmentLoading ||
                courseQuizAssignments.isLoading ? (
                  <span className="text-(--muted)">
                    <LoadingSpinnerIcon size={26} />
                  </span>
                ) : undefined
              }
              title={
                quizAssignmentLoading || courseQuizAssignments.isLoading
                  ? undefined
                  : "This quiz is not available to you"
              }
            >
              {quizAssignmentLoading || courseQuizAssignments.isLoading
                ? null
                : "It is not currently assigned to your course access."}
            </QuizStageMessage>
          )}
        </div>
      ) : isDedicatedQuizLesson && !hasLessonQuiz(selectedLesson) ? (
        <div className="w-full max-w-4xl mx-auto p-8 sm:p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)">
            <Exam size={28} weight="duotone" />
          </div>
          <h2 className="text-base font-semibold text-(--text)">
            Quiz Assessment Not Available
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-(--muted) max-w-md mx-auto">
            This lesson does not currently have an active quiz assessment
            assigned.
          </p>
        </div>
      ) : registerPersistentPlayer ? (
        <div
          // A reading pulled taller keeps its 16:9 box and adds the
          // extra height under it (content-box, so the padding is
          // added to the ratio's height, not taken from it).
          className="pointer-events-none relative z-10 aspect-video w-full overflow-visible bg-black max-h-(--learning-player-max-height) data-learning-player-grown:box-content! data-learning-player-grown:pb-(--learning-player-growth)"
          aria-hidden="true"
          data-learning-player-anchor=""
          data-learning-player-grown={
            appliedReadingGrowth === null ? undefined : ""
          }
          data-learning-player-shortened={
            appliedPlayerHeight === null ? undefined : ""
          }
          data-learning-player-hidden={
            appliedPlayerHeight === 0 ? "" : undefined
          }
          data-learning-player-tiny={
            appliedPlayerHeight !== null &&
            appliedPlayerHeight <= LESSON_PLAYER_TINY_HEIGHT
              ? ""
              : undefined
          }
          data-learning-player-short={shortPlayer ? "" : undefined}
          data-learning-player-very-short={seekTimeOnly ? "" : undefined}
          data-learning-player-compact={
            appliedPlayerHeight !== null &&
            appliedPlayerHeight <= LESSON_PLAYER_COMPACT_HEIGHT
              ? ""
              : undefined
          }
          style={
            appliedPlayerHeight !== null
              ? ({
                  [LESSON_PLAYER_MAX_HEIGHT_PROPERTY]: `${appliedPlayerHeight}px`,
                } as CSSProperties)
              : appliedReadingGrowth !== null
                ? ({
                    [LESSON_PLAYER_GROWTH_PROPERTY]: `${appliedReadingGrowth}px`,
                  } as CSSProperties)
                : undefined
          }
        >
          {persistentPlayerMounted ? null : (
            <div
              className="absolute inset-0 z-10 overflow-visible text-white"
              data-learning-player-initial-loader=""
            >
              <LessonPlayerChromePlaceholder {...lessonPlayerProps} />
            </div>
          )}
        </div>
      ) : (
        <LessonVideoPlayer {...lessonPlayerProps} />
      )}
      {stickyPlayer && registerPersistentPlayer ? (
        <LessonPlayerHeightHandle
          height={playerHeight}
          onChange={setPlayerHeight}
          growable={readingGrowable}
        />
      ) : null}
      {readingGrowable && registerPersistentPlayer ? (
        <ReadingFullHeightGuide />
      ) : null}
    </div>
  );
}
