import type { DragEvent } from "react";
import { QUIZ_TEXT_RESPONSE_MAX_LENGTH } from "@veolms/contracts";

interface QuizWrittenAnswerProps {
  questionId: string;
  /** The id of the question text, which names this box. */
  labelledBy: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** From here on the counter warns that the limit is close. */
const NEAR_LIMIT = QUIZ_TEXT_RESPONSE_MAX_LENGTH * 0.9;

/**
 * Where a learner writes a short answer.
 *
 * A plain writing box, on purpose. A formatting editor would have the answer
 * stored and shown as markup, and with markup come pasted images, links and
 * script: every one of them something to filter on the way in and again on
 * the way out. Text has none of that. It is saved as text and shown as text,
 * and what the learner needs from an editor, room to write and line breaks,
 * the box gives.
 *
 * It starts tall enough for a few sentences, grows with the answer where the
 * browser can size a field to its content, and can be dragged taller or
 * shorter by its corner.
 */
export function QuizWrittenAnswer({
  questionId,
  labelledBy,
  value,
  disabled = false,
  onChange,
}: QuizWrittenAnswerProps) {
  // A file dropped on a text box is not an answer, and a browser left to
  // itself opens the file in place of the quiz. Text dragged in from
  // elsewhere is not touched.
  const refuseFiles = (event: DragEvent<HTMLTextAreaElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
  };

  const helpId = `question-help-${questionId}`;
  const nearLimit = value.length >= NEAR_LIMIT;

  return (
    <div className="mt-5 sm:mt-6">
      <textarea
        id={`question-input-${questionId}`}
        aria-labelledby={labelledBy}
        aria-describedby={helpId}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onDragOver={refuseFiles}
        onDrop={refuseFiles}
        placeholder="Write your answer here"
        rows={6}
        // The server takes no more than this; without the cap here a longer
        // answer made the save of every answer fail.
        maxLength={QUIZ_TEXT_RESPONSE_MAX_LENGTH}
        autoComplete="off"
        className="block max-h-[70dvh] min-h-40 w-full resize-y field-sizing-content rounded-[14px] bg-(--card-surface-raised,var(--surface-strong)) px-4 py-3.5 text-base leading-relaxed text-(--text) ring-1 ring-[color-mix(in_srgb,var(--text)_12%,transparent)] transition-shadow outline-none ring-inset placeholder:text-(--muted) focus:ring-2 focus:ring-(--accent) disabled:cursor-not-allowed disabled:resize-none disabled:opacity-60 sm:min-h-44"
      />
      <div className="mt-2 flex items-start justify-between gap-4 text-xs leading-relaxed text-(--muted)">
        <p id={helpId}>
          Write your answer in your own words. Letters, numbers, symbols and
          code are all fine.
        </p>
        <p
          aria-label={`${value.length} of ${QUIZ_TEXT_RESPONSE_MAX_LENGTH} characters used`}
          className={`shrink-0 tabular-nums ${nearLimit ? "font-semibold text-(--quiz-caution)" : ""}`}
        >
          {value.length} / {QUIZ_TEXT_RESPONSE_MAX_LENGTH}
        </p>
      </div>
    </div>
  );
}
