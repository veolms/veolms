import { QUIZ_GUTTER } from "./QuizStage";

interface QuizProgressRailProps {
  /** One entry per question, in order: has it been answered. */
  answered: readonly boolean[];
  currentIndex: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
}

/** Past this many questions a segment is too thin to read or to press. */
const MAX_SEGMENTS = 40;

/**
 * Where the learner is in the quiz, and what is still open.
 *
 * One segment per question, across the full width of the stage like the
 * video's timeline. A filled segment is an answered question, the taller one
 * is the question on screen, and pressing a segment goes to that question.
 *
 * It replaces a bar that showed the current question's position as a
 * percentage — "100%" on the last question whether or not anything had been
 * answered — in a three-colour gradient that belonged to no palette.
 */
export function QuizProgressRail({
  answered,
  currentIndex,
  onSelect,
  disabled = false,
}: QuizProgressRailProps) {
  const total = answered.length;
  const answeredCount = answered.filter(Boolean).length;
  const summary = `Question ${currentIndex + 1} of ${total}, ${answeredCount} answered`;

  if (total > MAX_SEGMENTS) {
    return (
      <div
        role="progressbar"
        aria-label={summary}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answeredCount}
        className={`${QUIZ_GUTTER} py-2`}
      >
        <div className="h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)]">
          <div
            className="h-full rounded-full bg-(--accent) transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${(answeredCount / total) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <nav aria-label="Questions" className={QUIZ_GUTTER}>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
      <ol className={`flex ${total > 20 ? "gap-0.5" : "gap-1"}`}>
        {answered.map((isAnswered, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li key={index} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${index + 1}, ${isAnswered ? "answered" : "not answered"}`}
                title={`Question ${index + 1} · ${isAnswered ? "Answered" : "Not answered"}`}
                // The bar is 4px; the button around it is 20px so it can be
                // pressed with a finger.
                className="group flex h-5 w-full cursor-pointer items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-default"
              >
                <span
                  className={`block w-full rounded-full transition-[height,background-color] duration-200 ease-out motion-reduce:transition-none ${
                    isCurrent ? "h-1.5" : "h-1 group-hover:h-1.5"
                  } ${
                    isAnswered
                      ? "bg-(--accent)"
                      : isCurrent
                        ? "bg-[color-mix(in_srgb,var(--text)_46%,transparent)]"
                        : "bg-[color-mix(in_srgb,var(--text)_13%,transparent)]"
                  } ${isAnswered && !isCurrent ? "opacity-70" : ""}`}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
