import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Button } from "../../components/Button";
import { QUIZ_PRIMARY_ACTION } from "./QuizStage";

interface QuizAttemptFooterProps {
  currentIndex: number;
  total: number;
  answeredCount: number;
  /** The first question still open, when there is one. */
  firstUnansweredIndex: number | null;
  locked: boolean;
  submitting: boolean;
  onGoTo: (index: number) => void;
  onSubmit: () => void;
}

/**
 * Moving through the quiz and handing it in.
 *
 * The buttons carry their names. They were two unlabelled arrow squares with
 * a percentage between them, and on the last question a greyed-out Submit
 * that did not say what it was waiting for; the middle of the row now says
 * how many questions are answered and, when some are not, takes the learner
 * to the first of them.
 */
export function QuizAttemptFooter({
  currentIndex,
  total,
  answeredCount,
  firstUnansweredIndex,
  locked,
  submitting,
  onGoTo,
  onSubmit,
}: QuizAttemptFooterProps) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;
  const complete = answeredCount === total;
  const unanswered = total - answeredCount;
  const pointToUnanswered =
    isLast &&
    !complete &&
    !locked &&
    firstUnansweredIndex !== null &&
    firstUnansweredIndex !== currentIndex;

  return (
    <footer className="flex items-center gap-2 sm:gap-3">
      <button
        type="button"
        disabled={isFirst}
        onClick={() => onGoTo(currentIndex - 1)}
        aria-label="Previous question"
        className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm! font-semibold! text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-35 sm:px-4"
      >
        <ArrowLeft size={16} weight="bold" aria-hidden="true" />
        <span className="max-[419px]:sr-only">Previous</span>
      </button>

      <div className="min-w-0 flex-1 text-center text-[0.8125rem] text-(--muted)">
        {pointToUnanswered ? (
          <button
            type="button"
            onClick={() => onGoTo(firstUnansweredIndex)}
            className="max-w-full cursor-pointer truncate rounded-md px-1.5 py-1 text-[0.8125rem]! font-semibold! text-(--accent-ink,var(--accent)) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            {unanswered} unanswered
            <span className="max-[419px]:hidden"> — go to question</span>{" "}
            <span className="min-[420px]:hidden">· Q</span>
            {firstUnansweredIndex + 1}
          </button>
        ) : (
          <p className="truncate tabular-nums">
            <span className="font-semibold text-(--text-secondary)">
              {answeredCount}
            </span>{" "}
            of {total} answered
          </p>
        )}
      </div>

      {isLast ? (
        <Button
          disabled={!complete || submitting || locked}
          onClick={onSubmit}
          className={`${QUIZ_PRIMARY_ACTION} min-w-28`}
        >
          {submitting ? "Submitting…" : "Submit"}
          <CheckCircle size={17} weight="bold" aria-hidden="true" />
        </Button>
      ) : (
        <Button
          disabled={locked}
          onClick={() => onGoTo(currentIndex + 1)}
          className={`${QUIZ_PRIMARY_ACTION} min-w-28`}
        >
          Next
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </Button>
      )}
    </footer>
  );
}
