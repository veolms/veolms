import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import type { LearnerQuizAttempt } from "@veolms/contracts";
import { QUIZ_EYEBROW } from "./QuizStage";
import { QuizWrittenAnswer } from "./QuizWrittenAnswer";

type QuizQuestion = LearnerQuizAttempt["questions"][number];

interface QuizQuestionViewProps {
  question: QuizQuestion;
  index: number;
  total: number;
  selectedOptionIds: readonly string[];
  textResponse: string;
  disabled?: boolean;
  onToggleOption: (optionId: string) => void;
  onTextChange: (value: string) => void;
}

const ANSWER_HINT: Record<QuizQuestion["questionType"], string> = {
  single_choice: "Choose one answer",
  multiple_choice: "Select all that apply",
  true_false: "True or false",
  short_answer: "Write your answer",
};

export function QuizQuestionView({
  question,
  index,
  total,
  selectedOptionIds,
  textResponse,
  disabled = false,
  onToggleOption,
  onTextChange,
}: QuizQuestionViewProps) {
  const isMultiple = question.questionType === "multiple_choice";
  const promptId = `quiz-question-${question.id}`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={QUIZ_EYEBROW}>
          Question {index + 1}
          <span className="font-semibold opacity-70"> of {total}</span>
        </p>
        <p className="shrink-0 text-xs font-medium text-(--muted) tabular-nums">
          {question.points} point{question.points === 1 ? "" : "s"}
        </p>
      </div>

      {/* The question is what the learner came for, so it carries the
          largest type on the stage; it was the same size as its options. */}
      <h2
        id={promptId}
        className="mt-2.5 text-[1.125rem] leading-[1.45] font-semibold tracking-[-0.011em] wrap-break-word text-(--text) sm:mt-3 sm:text-xl lg:text-[1.375rem]"
      >
        {question.prompt}
      </h2>
      <p className="mt-1.5 text-[0.8125rem] text-(--muted)">
        {ANSWER_HINT[question.questionType] ?? ANSWER_HINT.single_choice}
      </p>

      {question.questionType === "short_answer" ? (
        <QuizWrittenAnswer
          questionId={question.id}
          labelledBy={promptId}
          value={textResponse}
          disabled={disabled}
          onChange={onTextChange}
        />
      ) : (
        <fieldset
          disabled={disabled}
          aria-labelledby={promptId}
          // Two answers side by side read as the either-or they are.
          className={`mt-5 grid gap-2.5 sm:mt-6 sm:gap-3 ${question.questionType === "true_false" ? "sm:grid-cols-2" : ""}`}
        >
          {question.options.map((option, optionIndex) => {
            const isSelected = selectedOptionIds.includes(option.id);
            return (
              <label
                key={option.id}
                className={`group relative flex min-h-14 cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 ring-inset transition-[background-color,box-shadow] duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--accent) has-disabled:cursor-not-allowed has-disabled:opacity-60 sm:gap-3.5 sm:px-3.5 ${
                  isSelected
                    ? "bg-[color-mix(in_srgb,var(--accent)_13%,var(--card-surface,var(--surface)))] ring-2 ring-(--accent)"
                    : "bg-(--card-surface-raised,var(--surface-strong)) ring-1 ring-[color-mix(in_srgb,var(--text)_7%,transparent)] hover:bg-(--card-surface-hover,var(--hover)) hover:ring-[color-mix(in_srgb,var(--text)_16%,transparent)]"
                }`}
              >
                <input
                  type={isMultiple ? "checkbox" : "radio"}
                  name={`question-${question.id}`}
                  checked={isSelected}
                  onChange={() => onToggleOption(option.id)}
                  className="sr-only"
                />
                {/* One marker does both jobs: it names the option and shows
                    whether it is chosen. Round for "pick one", square for
                    "pick any", as a radio button and a checkbox are. */}
                <span
                  aria-hidden="true"
                  className={`grid size-8 shrink-0 place-items-center text-[0.8125rem] font-bold transition-colors duration-150 ${isMultiple ? "rounded-[9px]" : "rounded-full"} ${
                    isSelected
                      ? "bg-(--accent) text-(--on-accent)"
                      : "bg-[color-mix(in_srgb,var(--text)_9%,transparent)] text-(--text-secondary) group-hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] group-hover:text-(--text)"
                  }`}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug font-medium wrap-break-word text-(--text)">
                  {option.text}
                </span>
                {/* Colour alone does not carry the choice. */}
                <Check
                  size={18}
                  weight="bold"
                  aria-hidden="true"
                  className={`shrink-0 text-(--accent-ink,var(--accent)) transition-opacity duration-150 ${isSelected ? "opacity-100" : "opacity-0"}`}
                />
              </label>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}
