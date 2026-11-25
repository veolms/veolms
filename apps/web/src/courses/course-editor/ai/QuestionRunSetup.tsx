import { useEffect, useId, useMemo, useState } from "react";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import {
  QUESTION_GENERATION_QUALITIES,
  type QuestionGenerationQuality,
  type QuestionGenerationSectionPlan,
  type QuizAiLevel,
  type QuizAiQuestionType,
  type StartQuestionGenerationRequest,
} from "@veolms/contracts";
import { Button } from "../../../components/Button";
import { Checkbox } from "../../../components/Checkbox";
import { FilterChips } from "../../../components/FilterChips";
import { LoadingSpinnerIcon } from "../../../components/LoadingSpinner";
import { FIELD, SELECT_TRIGGER } from "../../../coding-practice/shared/ui";
import { ThemedSelect } from "../../../ThemedSelect";
import { useQuestionJobEstimate } from "../../../services/question-ai";

export interface QuestionAiLesson {
  id: string;
  title: string;
}
export interface QuestionAiSection {
  id: string;
  title: string;
  lessons: QuestionAiLesson[];
}

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
const COUNTS = [3, 4, 5, 6, 7, 8, 9, 10];

/** A section's own choices; anything left out follows the defaults. */
interface SectionChoice {
  quizzes?: boolean;
  coding?: boolean;
  questionsPerQuiz?: number;
  level?: QuizAiLevel;
  note?: string;
}

const LABEL = "text-xs font-semibold text-(--text-secondary)";

const usd = (value: number) =>
  value < 0.1
    ? `$${value.toFixed(2)}`
    : `$${value.toFixed(value < 10 ? 2 : 0)}`;

/** One section: its quiz and coding switches, and its own settings. */
function SectionRow({
  section,
  choice,
  defaults,
  skipped,
  onChange,
  onToggleLesson,
}: {
  section: QuestionAiSection;
  choice: SectionChoice;
  defaults: { quizzes: boolean; coding: boolean; questionsPerQuiz: number };
  skipped: ReadonlySet<string>;
  onChange: (next: SectionChoice) => void;
  onToggleLesson: (lessonId: string, included: boolean) => void;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const quizzes = choice.quizzes ?? defaults.quizzes;
  const coding = choice.coding ?? defaults.coding;
  const left = section.lessons.filter((lesson) =>
    skipped.has(lesson.id),
  ).length;
  const off = !quizzes && !coding;
  const customised =
    choice.questionsPerQuiz !== undefined ||
    choice.level !== undefined ||
    Boolean(choice.note) ||
    left > 0;
  return (
    <li className="rounded-xl bg-[color-mix(in_srgb,var(--text)_2.5%,transparent)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        <span className="min-w-[min(100%,12rem)] flex-1">
          <span
            className={`block text-sm font-semibold break-words ${off ? "text-(--muted) line-through" : "text-(--text)"}`}
          >
            {section.title}
          </span>
          <span className="text-xs text-(--muted)">
            {section.lessons.length - left} of {section.lessons.length} lecture
            {section.lessons.length === 1 ? "" : "s"}
            {off ? " · skipped" : customised ? " · own settings" : ""}
          </span>
        </span>
        <Checkbox
          checked={quizzes}
          onCheckedChange={(value) => onChange({ ...choice, quizzes: value })}
          label="Quiz"
        />
        <Checkbox
          checked={coding}
          onCheckedChange={(value) => onChange({ ...choice, coding: value })}
          label="Coding"
        />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${ids}-more`}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs! font-semibold! text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        >
          Customise
          <CaretDown
            size={13}
            weight="bold"
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {open ? (
        <div
          id={`${ids}-more`}
          className="grid gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 pt-3 pb-3.5"
        >
          {quizzes ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className={LABEL}>Questions per quiz</span>
              <div className="w-40">
                <ThemedSelect<string>
                  triggerClassName={SELECT_TRIGGER}
                  value={String(choice.questionsPerQuiz ?? "")}
                  onValueChange={(value) =>
                    onChange({
                      ...choice,
                      questionsPerQuiz: value ? Number(value) : undefined,
                    })
                  }
                  ariaLabel={`Questions per quiz in ${section.title}`}
                  options={[
                    ["", `Default (${defaults.questionsPerQuiz})`],
                    ...COUNTS.map(
                      (count) =>
                        [String(count), String(count)] as [string, string],
                    ),
                  ]}
                />
              </div>
              <span className={LABEL}>Level</span>
              <FilterChips
                ariaLabel={`Level in ${section.title}`}
                value={choice.level ?? "default"}
                onChange={(value) =>
                  onChange({
                    ...choice,
                    level: value === "default" ? undefined : value,
                  })
                }
                items={[
                  { id: "default" as const, label: "Default" },
                  ...LEVELS,
                ]}
                wrap
              />
            </div>
          ) : null}
          <label className="grid gap-1.5">
            <span className={LABEL}>Note for this section</span>
            <input
              value={choice.note ?? ""}
              maxLength={500}
              onChange={(event) =>
                onChange({ ...choice, note: event.target.value || undefined })
              }
              placeholder="e.g. Revision lectures: keep it easy."
              className={`${FIELD} h-10`}
            />
          </label>
          <fieldset className="grid gap-1.5">
            <legend className={`${LABEL} mb-1.5`}>Lectures</legend>
            <ul className="grid max-h-56 gap-1.5 overflow-y-auto">
              {section.lessons.map((lesson, at) => (
                <li key={lesson.id}>
                  <Checkbox
                    checked={!skipped.has(lesson.id)}
                    onCheckedChange={(value) =>
                      onToggleLesson(lesson.id, value)
                    }
                    label={`${at + 1}. ${lesson.title}`}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The settings of a course-wide run: how good (and costly) the writing is,
 * what to make for every lecture, each section's own plan (skip it, only
 * quizzes, other counts, a note) and the lectures to leave out, then the
 * estimate and a limit the run stops at.
 */
export function QuestionRunSetup({
  courseId,
  sections,
  starting,
  error,
  onStart,
  onCancel,
}: {
  courseId: string;
  sections: QuestionAiSection[];
  starting: boolean;
  error: string | null;
  onStart: (settings: StartQuestionGenerationRequest) => void;
  onCancel: () => void;
}) {
  const [quality, setQuality] = useState<QuestionGenerationQuality>("balanced");
  const [quizzes, setQuizzes] = useState(true);
  const [coding, setCoding] = useState(true);
  const [count, setCount] = useState(5);
  const [level, setLevel] = useState<QuizAiLevel>("mixed");
  const [types, setTypes] = useState<QuizAiQuestionType[]>([
    "single_choice",
    "multiple_choice",
    "true_false",
  ]);
  const [choices, setChoices] = useState<Record<string, SectionChoice>>({});
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [skipExisting, setSkipExisting] = useState(true);
  const [guidance, setGuidance] = useState("");
  const [limit, setLimit] = useState("");

  const settings = useMemo<StartQuestionGenerationRequest>(() => {
    const plans: QuestionGenerationSectionPlan[] = [];
    for (const section of sections) {
      const choice = choices[section.id];
      if (!choice) continue;
      const own =
        choice.quizzes !== undefined ||
        choice.coding !== undefined ||
        choice.questionsPerQuiz !== undefined ||
        choice.level !== undefined ||
        Boolean(choice.note?.trim());
      if (!own) continue;
      plans.push({
        sectionId: section.id,
        quizzes: choice.quizzes ?? quizzes,
        coding: choice.coding ?? coding,
        ...(choice.questionsPerQuiz !== undefined
          ? { questionsPerQuiz: choice.questionsPerQuiz }
          : {}),
        ...(choice.level ? { level: choice.level } : {}),
        ...(choice.note?.trim() ? { note: choice.note.trim() } : {}),
      });
    }
    const cap = Number(limit);
    return {
      quality,
      quizzes,
      coding,
      questionsPerQuiz: count,
      level,
      types,
      skipExisting,
      sections: plans,
      skipLessonIds: [...skipped],
      maxCostUsd: limit && cap > 0 ? cap : null,
      ...(guidance.trim() ? { guidance: guidance.trim() } : {}),
    };
  }, [
    sections,
    choices,
    quality,
    quizzes,
    coding,
    count,
    level,
    types,
    skipExisting,
    skipped,
    limit,
    guidance,
  ]);

  // The estimate follows the settings a moment after they stop changing.
  const [asked, setAsked] = useState(settings);
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(settings), 350);
    return () => window.clearTimeout(timer);
  }, [settings]);
  const estimate = useQuestionJobEstimate(courseId, asked, true);
  const shown = estimate.data;
  const chosenQuality = QUESTION_GENERATION_QUALITIES.find(
    (entry) => entry.id === quality,
  )!;
  const nothing = shown ? shown.lectures === 0 : false;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className={LABEL}>Quality and cost</span>
        <FilterChips
          ariaLabel="Quality and cost"
          value={quality}
          onChange={setQuality}
          items={QUESTION_GENERATION_QUALITIES.map((entry) => ({
            id: entry.id,
            label:
              entry.id === "balanced"
                ? `${entry.label} (suggested)`
                : entry.label,
          }))}
          wrap
        />
        <p className="text-xs text-(--muted)">{chosenQuality.note}</p>
      </div>

      <div className="grid gap-3">
        <span className="text-sm font-semibold text-(--text)">
          For every lecture
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Checkbox
            checked={quizzes}
            onCheckedChange={setQuizzes}
            label="A quiz"
          />
          <Checkbox
            checked={coding}
            onCheckedChange={setCoding}
            label="A coding question, where the lecture teaches code"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
          <span className={LABEL}>Questions per quiz</span>
          <div className="w-32">
            <ThemedSelect<string>
              triggerClassName={SELECT_TRIGGER}
              value={String(count)}
              onValueChange={(value) => setCount(Number(value))}
              ariaLabel="Questions per quiz"
              options={COUNTS.map(
                (value) => [String(value), String(value)] as [string, string],
              )}
            />
          </div>
          <span className={LABEL}>Level</span>
          <FilterChips
            ariaLabel="How hard"
            value={level}
            onChange={setLevel}
            items={LEVELS}
            wrap
          />
          <span className={LABEL}>Quiz questions</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {TYPES.map((type) => (
              <Checkbox
                key={type.id}
                checked={types.includes(type.id)}
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
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-semibold text-(--text)">By section</span>
        <p className="text-xs text-(--muted)">
          Turn a section&apos;s quiz or coding question off, or open Customise
          for its own count, level, a note, and the lectures to leave out.
        </p>
        <ul className="grid gap-1.5">
          {sections.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              choice={choices[section.id] ?? {}}
              defaults={{ quizzes, coding, questionsPerQuiz: count }}
              skipped={skipped}
              onChange={(next) =>
                setChoices((current) => ({ ...current, [section.id]: next }))
              }
              onToggleLesson={(lessonId, included) =>
                setSkipped((current) => {
                  const next = new Set(current);
                  if (included) next.delete(lessonId);
                  else next.add(lessonId);
                  return next;
                })
              }
            />
          ))}
        </ul>
        <Checkbox
          checked={skipExisting}
          onCheckedChange={setSkipExisting}
          label="Skip lectures that already have their questions"
        />
      </div>

      <label className="grid gap-1.5">
        <span className={LABEL}>Note for the AI (every lecture)</span>
        <textarea
          value={guidance}
          maxLength={1_000}
          rows={2}
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="Optional, e.g. My students are beginners; keep the English simple."
          className={`${FIELD} min-h-16 resize-y py-2`}
        />
      </label>

      <div className="grid gap-2 rounded-xl bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-3 sm:p-4">
        {shown ? (
          <p className="text-sm text-(--text)">
            <b>{shown.lectures}</b> lecture{shown.lectures === 1 ? "" : "s"} ·{" "}
            {shown.quizzes} quiz{shown.quizzes === 1 ? "" : "zes"} · up to{" "}
            {shown.codingAtMost} coding question
            {shown.codingAtMost === 1 ? "" : "s"}
            <br />
            About <b>{usd(shown.lowUsd)}</b> to <b>{usd(shown.highUsd)}</b>{" "}
            <span className="text-(--muted)">
              (about ₹{shown.lowInr} to ₹{shown.highInr})
            </span>{" "}
            · about {shown.minutes} minute{shown.minutes === 1 ? "" : "s"}
            {estimate.isFetching ? (
              <LoadingSpinnerIcon size={12} className="ml-2 inline" />
            ) : null}
          </p>
        ) : estimate.error ? (
          <p className="text-sm text-(--danger,#e11d48)">
            The estimate could not be worked out.
          </p>
        ) : (
          <p className="text-sm text-(--muted)">Working out the cost…</p>
        )}
        <label className="flex flex-wrap items-center gap-2 text-xs text-(--text-secondary)">
          Stop if this run costs more than $
          <input
            type="number"
            min={0.1}
            step={0.5}
            inputMode="decimal"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder={
              shown ? String(Math.max(1, Math.ceil(shown.highUsd))) : ""
            }
            aria-label="Cost limit in US dollars"
            className={`${FIELD} h-9 w-24!`}
          />
          <span className="text-(--muted)">(optional)</span>
        </label>
        <p className="text-xs text-(--muted)">
          It runs on the server: you can leave this page and come back. What it
          spent shows as it goes.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-(--danger,#e11d48)">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-9 px-3.5"
          disabled={
            starting ||
            nothing ||
            (!quizzes && !coding && settings.sections?.length === 0)
          }
          onClick={() => onStart(settings)}
        >
          {starting ? (
            <LoadingSpinnerIcon size={15} />
          ) : (
            <Sparkle size={15} weight="fill" aria-hidden="true" />
          )}
          Start
        </Button>
        <Button
          variant="quiet"
          elevation="flat"
          className="h-9 px-3"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
