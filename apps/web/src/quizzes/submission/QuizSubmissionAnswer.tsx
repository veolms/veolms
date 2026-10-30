import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon as Circle } from "@phosphor-icons/react/Circle";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type {
  QuizQuestionType,
  QuizSubmissionQuestion,
} from "@veolms/contracts";
import { QuizFormattedText } from "../attempt/QuizFormattedText";
import { formatMarksOutOf } from "../quizMarks";

const QUESTION_TYPE_LABEL: Record<QuizQuestionType, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  short_answer: "Written answer",
};

type Verdict = "correct" | "incorrect" | "unanswered" | "ungraded";

function verdictOf(question: QuizSubmissionQuestion): Verdict {
  if (question.isCorrect === null) return "ungraded";
  if (!question.answered) return "unanswered";
  return question.isCorrect ? "correct" : "incorrect";
}

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  correct: {
    label: "Correct",
    className: "bg-emerald-500/12 text-emerald-500",
  },
  incorrect: {
    label: "Incorrect",
    className: "bg-rose-500/12 text-rose-500",
  },
  unanswered: {
    label: "Not answered",
    className:
      "bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--muted)",
  },
  ungraded: {
    label: "Not graded yet",
    className:
      "bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--muted)",
  },
};

/**
 * One question of a submission: the prompt, every option with the one(s)
 * the student picked and the answer key, or their written answer, and the
 * marks it earned.
 */
export function QuizSubmissionAnswer({
  question,
  index,
}: {
  question: QuizSubmissionQuestion;
  index: number;
}) {
  const verdict = verdictOf(question);
  const isWritten = question.questionType === "short_answer";

  return (
    <li className="rounded-xl border border-(--border) p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-(--muted)">
          Question {index + 1}
          <span aria-hidden> · </span>
          {QUESTION_TYPE_LABEL[question.questionType]}
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${VERDICT[verdict].className}`}
          >
            {VERDICT[verdict].label}
          </span>
          <span className="text-xs font-semibold tabular-nums text-(--text)">
            {formatMarksOutOf(question.pointsAwarded, question.points)}
            <span className="sr-only"> marks</span>
          </span>
        </div>
      </div>

      <QuizFormattedText
        text={question.prompt || "Untitled question"}
        label={`Question ${index + 1}`}
        className="mt-2 text-sm! leading-relaxed! font-semibold text-(--text)!"
      />

      {isWritten ? (
        <div className="mt-3">
          <p className="text-[0.68rem] font-semibold tracking-wide text-(--muted) uppercase">
            Student’s answer
          </p>
          {/* A written answer keeps its line breaks and indentation. */}
          <p
            className={`mt-1.5 rounded-lg bg-(--canvas) px-3 py-2.5 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap ${question.textResponse?.trim() ? "text-(--text)" : "text-(--muted) italic"}`}
          >
            {question.textResponse?.trim()
              ? question.textResponse
              : "No answer"}
          </p>
        </div>
      ) : (
        <ul
          className="mt-3 grid gap-1.5"
          aria-label={`Options for question ${index + 1}`}
        >
          {question.options.map((option) => (
            <SubmissionOption key={option.id} option={option} />
          ))}
        </ul>
      )}

      {question.explanation ? (
        <div className="mt-3 border-l-2 border-(--border) pl-3">
          <p className="text-[0.68rem] font-semibold tracking-wide text-(--muted) uppercase">
            Explanation
          </p>
          <QuizFormattedText
            text={question.explanation}
            label={`Explanation for question ${index + 1}`}
            className="mt-1 text-[0.8125rem]! leading-relaxed! text-(--text-secondary)!"
          />
        </div>
      ) : null}
    </li>
  );
}

function SubmissionOption({
  option,
}: {
  option: QuizSubmissionQuestion["options"][number];
}) {
  const tone = option.selected
    ? option.isCorrect
      ? "border-emerald-500/40 bg-emerald-500/10"
      : "border-rose-500/40 bg-rose-500/10"
    : option.isCorrect
      ? "border-dashed border-emerald-500/50"
      : "border-(--border)";
  const tags = [
    option.selected ? "Selected" : null,
    option.isCorrect ? "Correct answer" : null,
  ].filter(Boolean);

  return (
    <li
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${tone}`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {option.selected && option.isCorrect ? (
          <CheckCircle size={18} weight="fill" className="text-emerald-500" />
        ) : option.selected ? (
          <XCircle size={18} weight="fill" className="text-rose-500" />
        ) : option.isCorrect ? (
          <CheckCircle size={18} className="text-emerald-500" />
        ) : (
          <Circle size={18} className="text-(--muted)" />
        )}
      </span>
      <span className="min-w-0 flex-1 wrap-break-word text-(--text)">
        {option.text}
      </span>
      {tags.length ? (
        <span className="shrink-0 text-[0.68rem] font-semibold text-(--muted)">
          {tags.join(" · ")}
        </span>
      ) : null}
    </li>
  );
}
