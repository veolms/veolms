import { Button } from "../../components/Button";
import { QuizScoreRing } from "./QuizScoreRing";
import {
  QUIZ_EYEBROW,
  QUIZ_PRIMARY_ACTION,
  QUIZ_SECONDARY_ACTION,
  QuizStage,
  QuizStageBar,
  QuizStageBody,
  QuizStat,
} from "./QuizStage";

interface QuizPreviousAttemptsViewProps {
  quizTitle: string;
  attemptCount: number;
  maxAttempts: number;
  bestScore: number | null;
  latestPassed: boolean | null;
  lessonBadge?: string;
  onBackToVideo?: () => void;
  onContinueCourse?: () => void;
  onStart?: () => void;
}

/**
 * Shown when a student who has already attempted the quiz opens it again:
 * where they stand, and an explicit way to start another attempt if one is
 * left.
 */
export function QuizPreviousAttemptsView({
  quizTitle,
  attemptCount,
  maxAttempts,
  bestScore,
  latestPassed,
  lessonBadge,
  onBackToVideo,
  onContinueCourse,
  onStart,
}: QuizPreviousAttemptsViewProps) {
  const attemptsLeft = Math.max(0, maxAttempts - attemptCount);
  // Passed: moving on is the next step. Not passed: trying again is.
  const continueIsPrimary = Boolean(latestPassed) || !onStart;

  return (
    <QuizStage label="Quiz summary">
      <QuizStageBar onBackToVideo={onBackToVideo} context={lessonBadge} />
      <QuizStageBody className="pt-4 pb-6 sm:pt-7 sm:pb-9">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
          <QuizScoreRing
            percentage={bestScore}
            tone={latestPassed ? "positive" : "neutral"}
            caption="Best"
          />
          <div className="min-w-0 flex-1">
            <p className={QUIZ_EYEBROW}>
              {latestPassed ? "Quiz passed" : "Quiz attempted"}
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight wrap-break-word text-(--text) sm:text-[1.75rem]">
              {quizTitle}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-(--text-secondary)">
              {onStart
                ? "A new attempt starts as soon as you choose it."
                : "You have used all attempts for this quiz."}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2.5 text-left sm:max-w-sm">
              {/* The ring already shows the best score. */}
              <QuizStat
                label="Attempts used"
                value={`${attemptCount} of ${maxAttempts}`}
              />
              <QuizStat label="Attempts left" value={String(attemptsLeft)} />
            </dl>
          </div>
        </div>

        {onStart || onContinueCourse ? (
          <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row">
            {onContinueCourse && continueIsPrimary ? (
              <Button
                onClick={onContinueCourse}
                className={QUIZ_PRIMARY_ACTION}
              >
                Continue course
              </Button>
            ) : null}
            {onStart ? (
              <Button
                motion={
                  continueIsPrimary && onContinueCourse ? "static" : "lift"
                }
                onClick={onStart}
                className={
                  continueIsPrimary && onContinueCourse
                    ? QUIZ_SECONDARY_ACTION
                    : QUIZ_PRIMARY_ACTION
                }
              >
                Start attempt {attemptCount + 1}
              </Button>
            ) : null}
            {onContinueCourse && !continueIsPrimary ? (
              <Button
                motion="static"
                onClick={onContinueCourse}
                className={QUIZ_SECONDARY_ACTION}
              >
                Continue course
              </Button>
            ) : null}
          </div>
        ) : null}
      </QuizStageBody>
    </QuizStage>
  );
}
