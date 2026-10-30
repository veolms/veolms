import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { formatQuizRemainingTime } from "../quizDraft";
import { useQuizRemainingSeconds, type QuizClock } from "./quizCountdown";
import { QuizStatusChip } from "./QuizStage";

/**
 * The time left in a timed attempt. The only part of the attempt that is
 * drawn again every second.
 */
export function QuizCountdownChip({
  clock,
  expiresAtMs,
  clockOffsetMs,
}: {
  clock: QuizClock;
  expiresAtMs: number;
  clockOffsetMs: number;
}) {
  const remainingSeconds = useQuizRemainingSeconds(
    clock,
    expiresAtMs,
    clockOffsetMs,
  );
  const timeExpired = remainingSeconds === 0;
  return (
    <QuizStatusChip
      tone={
        timeExpired
          ? "negative"
          : remainingSeconds <= 60
            ? "caution"
            : "neutral"
      }
      icon={<Clock size={14} weight="bold" aria-hidden="true" />}
    >
      {/* A timer, not a live region: announcing every second would
          talk over the question. */}
      <span role="timer" aria-label="Time remaining">
        {timeExpired
          ? "Time expired"
          : formatQuizRemainingTime(remainingSeconds)}
      </span>
    </QuizStatusChip>
  );
}
