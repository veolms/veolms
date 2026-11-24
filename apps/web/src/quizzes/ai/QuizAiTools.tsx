import { useId, useState } from "react";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import {
  QUIZ_AI_LIMITS,
  type CreateQuizQuestionRequest,
  type QuizAiLevel,
  type QuizAiQuestionType,
} from "@veolms/contracts";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { FilterChips } from "../../components/FilterChips";
import { AiProgressLine } from "../../coding-practice/authoring/AiAssist";
import { FIELD } from "../../coding-practice/shared/ui";
import { useAiAvailability } from "../../services/ai";
import { useQuizAiWriter, type QuizAiResult } from "../../services/question-ai";

const LEVELS: { id: QuizAiLevel; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "mixed", label: "Easy to harder" },
  { id: "hard", label: "Harder" },
];
const TYPES: { id: QuizAiQuestionType; label: string }[] = [
  { id: "single_choice", label: "One right answer" },
  { id: "multiple_choice", label: "Select all that apply" },
  { id: "true_false", label: "True or false" },
];

/** True when AI can be used here (switched on, with a key). */
export function useQuizAiAvailable() {
  return useAiAvailability().data?.available ?? false;
}

/**
 * "Write with AI" under a lecture's quiz: how many questions, how hard,
 * which kinds, and a note; the AI reads the lecture (its notes and what
 * the video says) and the questions land in the editor, unsaved, for the
 * author to read, change and save.
 */
export function QuizAiWriter({
  courseId,
  lessonId,
  existingPrompts,
  onResult,
}: {
  courseId: string;
  lessonId: string;
  /** Questions the quiz has: not repeated. */
  existingPrompts: string[];
  onResult: (result: QuizAiResult) => void;
}) {
  const ids = useId();
  const writer = useQuizAiWriter(courseId, lessonId);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [level, setLevel] = useState<QuizAiLevel>("mixed");
  const [types, setTypes] = useState<QuizAiQuestionType[]>([
    "single_choice",
    "multiple_choice",
    "true_false",
  ]);
  const [guidance, setGuidance] = useState("");
  const [summary, setSummary] = useState<string | null>(null);

  const write = async () => {
    setSummary(null);
    const result = await writer.write({
      count,
      level,
      types,
      guidance: guidance.trim() || undefined,
      existingPrompts,
    });
    if (!result) return;
    onResult(result);
    setSummary(
      result.questions.length
        ? `${result.summary} Read them below, change what you like, then save.`
        : result.summary ||
            "The AI found nothing to ask about in this lecture.",
    );
    setOpen(false);
  };

  if (!open)
    return (
      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => {
            writer.clearError();
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))] px-3 py-1.5 text-xs font-semibold text-(--accent) transition-all hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] cursor-pointer"
        >
          <Sparkle size={13} weight="fill" aria-hidden="true" />
          <span>Write questions with AI</span>
        </button>
        {summary ? (
          <p role="status" className="text-xs text-(--text-secondary)">
            {summary}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Sparkle
          size={16}
          weight="fill"
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-(--accent)"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--text)">
            Write questions with AI
          </p>
          <p className="text-xs text-(--muted)">
            It reads this lecture (its notes and what the video says) and writes
            plain questions in the order the lecture teaches. Nothing is saved
            until you save.
          </p>
        </div>
      </div>

      {writer.progress ? (
        <AiProgressLine progress={writer.progress} onCancel={writer.cancel} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <label
              htmlFor={`${ids}-count`}
              className="text-xs font-semibold text-(--text-secondary)"
            >
              Questions
            </label>
            <input
              id={`${ids}-count`}
              type="number"
              min={QUIZ_AI_LIMITS.minQuestions}
              max={QUIZ_AI_LIMITS.maxQuestions}
              value={count}
              onChange={(event) =>
                setCount(
                  Math.min(
                    QUIZ_AI_LIMITS.maxQuestions,
                    Math.max(
                      QUIZ_AI_LIMITS.minQuestions,
                      Number(event.target.value) || QUIZ_AI_LIMITS.minQuestions,
                    ),
                  ),
                )
              }
              className={`${FIELD} h-10 w-24!`}
            />
            <span className="text-xs font-semibold text-(--text-secondary)">
              Level
            </span>
            <FilterChips
              ariaLabel="How hard"
              value={level}
              onChange={setLevel}
              items={LEVELS}
              wrap
            />
            <span className="text-xs font-semibold text-(--text-secondary)">
              Kinds
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {TYPES.map((type) => (
                <Checkbox
                  key={type.id}
                  checked={types.includes(type.id)}
                  // At least one kind stays chosen.
                  disabled={types.length === 1 && types.includes(type.id)}
                  onCheckedChange={(checked) =>
                    setTypes((current) =>
                      checked
                        ? [...current, type.id]
                        : current.filter((item) => item !== type.id),
                    )
                  }
                  label={type.label}
                />
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-(--text-secondary)">
              Note for the AI (optional)
            </span>
            <textarea
              value={guidance}
              maxLength={QUIZ_AI_LIMITS.maxGuidanceChars}
              rows={2}
              onChange={(event) => setGuidance(event.target.value)}
              placeholder="e.g. Focus on when to use map vs forEach. My students are beginners."
              className={`${FIELD} min-h-16 resize-y py-2`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-9 px-3.5" onClick={() => void write()}>
              <Sparkle size={15} weight="fill" aria-hidden="true" />
              Write {count} questions
            </Button>
            <Button
              variant="quiet"
              elevation="flat"
              className="h-9 px-3"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
      {writer.error ? (
        <p role="alert" className="text-sm text-(--danger,#e11d48)">
          {writer.error}
        </p>
      ) : null}
    </div>
  );
}

const QUICK_CHANGES = [
  "Make it clearer",
  "Make it easier",
  "Make it harder",
  "Better wrong answers",
  "Add a short code example",
];

/**
 * "Rewrite with AI" on the question being edited: a quick change or the
 * author's own words; the rewritten question replaces the one in the
 * editor (saved as any edit is).
 */
export function QuizQuestionAiRewrite({
  courseId,
  lessonId,
  question,
  onResult,
}: {
  courseId: string;
  lessonId: string;
  question: CreateQuizQuestionRequest;
  onResult: (question: CreateQuizQuestionRequest) => void;
}) {
  const writer = useQuizAiWriter(courseId, lessonId);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const rewrite = async (words: string) => {
    if (!words.trim()) return;
    setDone(null);
    const result = await writer.revise({ question, instruction: words.trim() });
    const next = result?.questions[0];
    if (!next) return;
    onResult(next);
    setDone(result.summary);
    setInstruction("");
    setOpen(false);
  };

  if (writer.progress)
    return (
      <AiProgressLine progress={writer.progress} onCancel={writer.cancel} />
    );

  return (
    <div className="grid gap-2">
      {open ? (
        <div className="grid gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] p-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CHANGES.map((words) => (
              <button
                key={words}
                type="button"
                onClick={() => void rewrite(words)}
                className="rounded-full border border-[color-mix(in_srgb,var(--text)_14%,transparent)] px-2.5 py-1 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent) hover:text-(--text) cursor-pointer"
              >
                {words}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void rewrite(instruction);
            }}
          >
            <input
              value={instruction}
              maxLength={QUIZ_AI_LIMITS.maxGuidanceChars}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Or say what to change…"
              aria-label="What to change"
              className={`${FIELD} h-10 min-w-0 flex-1`}
            />
            <Button
              type="submit"
              className="h-10 px-3"
              disabled={!instruction.trim()}
            >
              Rewrite
            </Button>
            <Button
              variant="quiet"
              elevation="flat"
              className="h-10 px-3"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            writer.clearError();
            setOpen(true);
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-(--accent) transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] cursor-pointer"
        >
          <Sparkle size={13} weight="fill" aria-hidden="true" />
          Rewrite with AI
        </button>
      )}
      {done ? (
        <p role="status" className="text-xs text-(--text-secondary)">
          {done} Check it, then it saves as usual.
        </p>
      ) : null}
      {writer.error ? (
        <p role="alert" className="text-xs text-(--danger,#e11d48)">
          {writer.error}
        </p>
      ) : null}
    </div>
  );
}
