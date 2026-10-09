import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type { QuizResult } from "@veolms/contracts";
import { Button } from "../../components/Button";
import { QuizFormattedText } from "./QuizFormattedText";
import { QuizScoreRing } from "./QuizScoreRing";
import {
  QUIZ_EYEBROW,
  QUIZ_HAIRLINE,
  QUIZ_PRIMARY_ACTION,
  QUIZ_RAISED_SURFACE,
  QUIZ_SECONDARY_ACTION,
  QuizStage,
  QuizStageBar,
  QuizStageBody,
  QuizStat,
  quizToneText,
} from "./QuizStage";

interface QuizResultViewProps {
  result: QuizResult;
  maxAttempts?: number;
  lessonBadge?: string;
  onBackToVideo?: () => void;
  onContinueCourse?: () => void;
  onRetry?: () => void;
}

export function QuizResultView({
  result,
  maxAttempts = 1,
  lessonBadge,
  onBackToVideo,
  onContinueCourse,
  onRetry,
}: QuizResultViewProps) {
  const expired = result.status === "expired";
  const tone = result.passed ? "positive" : "negative";
  const headline = result.passed
    ? "You passed"
    : onRetry
      ? "Not passed yet"
      : "Not passed";
  const summary = expired
    ? "The time limit was reached before any answers were saved."
    : result.passed
      ? "Nicely done. This lesson's quiz is complete."
      : onRetry
        ? "You can go over the lesson and take another attempt."
        : "You have used every attempt for this quiz.";
  const answers =
    result.feedbackMode !== "never" && result.answers?.length
      ? result.answers
      : null;
  // The step that moves the learner forward gets the filled button: on to
  // the next lesson once passed, another attempt while one is left.
  const continueIsPrimary = result.passed || !onRetry;

  return (
    <QuizStage label="Quiz result">
      <QuizStageBar onBackToVideo={onBackToVideo} context={lessonBadge} />
      <QuizStageBody className="pt-4 pb-6 sm:pt-7 sm:pb-9">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
          <QuizScoreRing percentage={result.percentage} tone={tone} />
          <div className="min-w-0 flex-1">
            <p className={QUIZ_EYEBROW}>
              {expired ? "Time ran out" : "Quiz completed"}
            </p>
            <h1
              className={`mt-1.5 text-2xl font-bold tracking-tight sm:text-[1.75rem] ${quizToneText(tone)}`}
            >
              {headline}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-(--text-secondary)">
              {summary}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2.5 text-left sm:max-w-sm">
              <QuizStat
                label="Score"
                value={`${result.score} / ${result.maxScore}`}
              />
              <QuizStat
                label="Attempt"
                value={`${result.attemptNumber}${maxAttempts > 1 ? ` of ${maxAttempts}` : ""}`}
              />
            </dl>
          </div>
        </div>

        {onRetry || onContinueCourse ? (
          <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row">
            {onContinueCourse && continueIsPrimary ? (
              <Button
                onClick={onContinueCourse}
                className={QUIZ_PRIMARY_ACTION}
              >
                Continue course
              </Button>
            ) : null}
            {onRetry ? (
              <Button
                motion={
                  continueIsPrimary && onContinueCourse ? "static" : "lift"
                }
                onClick={onRetry}
                className={
                  continueIsPrimary && onContinueCourse
                    ? QUIZ_SECONDARY_ACTION
                    : QUIZ_PRIMARY_ACTION
                }
              >
                Try another attempt
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

        {answers ? (
          <div
            className={`mt-7 border-t pt-6 sm:mt-9 sm:pt-7 ${QUIZ_HAIRLINE}`}
          >
            <h2 className="text-base font-bold text-(--text)">Answer review</h2>
            <ol className="mt-3.5 grid gap-2.5 sm:gap-3">
              {answers.map((answer, index) => {
                const answerTone = answer.isCorrect ? "positive" : "negative";
                const given =
                  answer.textResponse !== undefined &&
                  answer.textResponse !== null
                    ? answer.textResponse || "No answer"
                    : answer.selectedOptionTexts?.join(", ") || "No answer";
                return (
                  <li
                    key={answer.questionId}
                    className={`flex gap-3 rounded-[14px] p-3.5 sm:gap-3.5 sm:p-4 ${QUIZ_RAISED_SURFACE}`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${quizToneText(answerTone)}`}
                    >
                      {answer.isCorrect ? (
                        <CheckCircle size={20} weight="fill" aria-hidden />
                      ) : (
                        <XCircle size={20} weight="fill" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-1.5 text-[0.9375rem] leading-snug font-semibold text-(--text)">
                          <span className="shrink-0 text-(--muted)">
                            {index + 1}.
                          </span>
                          <QuizFormattedText
                            text={answer.prompt}
                            label={`Question ${index + 1}`}
                            className="min-w-0 text-[0.9375rem]! leading-snug! text-(--text)! [&_strong]:font-extrabold"
                          />
                        </div>
                        <p
                          className={`shrink-0 text-xs font-bold tabular-nums ${quizToneText(answerTone)}`}
                        >
                          <span className="sr-only">
                            {answer.isCorrect ? "Correct" : "Incorrect"},{" "}
                          </span>
                          {answer.pointsAwarded} pt
                          {answer.pointsAwarded === 1 ? "" : "s"}
                        </p>
                      </div>
                      <dl className="mt-2 grid gap-1 text-[0.8125rem] leading-relaxed">
                        <div className="flex gap-1.5">
                          <dt className="shrink-0 font-semibold text-(--muted)">
                            Your answer
                          </dt>
                          {/* A written answer keeps its line breaks. */}
                          <dd className="min-w-0 wrap-break-word whitespace-pre-wrap text-(--text-secondary)">
                            {given}
                          </dd>
                        </div>
                        {/* The server sends no correct answers while they
                            are withheld (until the last attempt or the due
                            date). */}
                        {!answer.isCorrect &&
                        answer.correctOptionTexts?.length ? (
                          <div className="flex gap-1.5">
                            <dt className="shrink-0 font-semibold text-(--muted)">
                              Correct answer
                            </dt>
                            <dd className="min-w-0 wrap-break-word text-(--text-secondary)">
                              {answer.correctOptionTexts.join(" or ")}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      {answer.explanation ? (
                        <div
                          className={`mt-2.5 border-l-2 pl-3 ${QUIZ_HAIRLINE}`}
                        >
                          <QuizFormattedText
                            text={answer.explanation}
                            label="Explanation"
                            className="text-[0.8125rem]! leading-relaxed! font-normal"
                          />
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </QuizStageBody>
    </QuizStage>
  );
}
