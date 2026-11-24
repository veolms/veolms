import { useId, useState } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import type {
  CodingExerciseKind,
  CodingLanguage,
  CourseCodingExercise,
} from "@veolms/contracts";
import { Button } from "../../components/Button";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { ThemedSelect } from "../../ThemedSelect";
import { getApiError } from "../../lib/api-error";
import { useAiAvailability } from "../../services/ai";
import {
  useCodingExercise,
  useCourseCodingExercises,
  useCreateCodingExercise,
} from "../../services/coding-practice";
import {
  CODE_TONES,
  DifficultyLabel,
  FIELD,
  FOCUS_RING,
  KIND_LABELS,
  KIND_SHORT,
  SELECT_TRIGGER,
} from "../shared/ui";
import { AiQuestionForm } from "./AiQuestionForm";
import { ExerciseWorkbench } from "./ExerciseWorkbench";

export interface LessonPracticePanelProps {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  /** May create and edit (coding.manage); otherwise read only. */
  canManage: boolean;
}

const LANGUAGES: readonly (readonly [CodingLanguage, string])[] = [
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
];

function StatusPill({ exercise }: { exercise: CourseCodingExercise }) {
  const live = exercise.latestPublishedVersion !== null;
  const tone = live
    ? "bg-[color-mix(in_srgb,var(--code-pass)_14%,transparent)] text-(--code-pass)"
    : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text-secondary)";
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold ${tone}`}
    >
      {!live
        ? "Draft"
        : exercise.hasUnpublishedChanges
          ? "Live · edits not published"
          : "Live"}
    </span>
  );
}

/** Two or more choices side by side (radio buttons that look like a switch). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold text-(--text-secondary)">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex h-10 gap-1 rounded-[10px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] p-1"
      >
        {options.map(([option, text]) => {
          const checked = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(option)}
              className={`min-w-0 flex-1 cursor-pointer rounded-lg px-3 text-sm! font-semibold! transition-colors ${FOCUS_RING} ${
                checked
                  ? "bg-(--surface) text-(--text) shadow-sm"
                  : "text-(--text-secondary) hover:text-(--text)"
              }`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewQuestionForm({
  courseId,
  lessonId,
  onCreated,
  onCancel,
}: {
  courseId: string;
  lessonId: string;
  onCreated: (exerciseId: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const create = useCreateCodingExercise(courseId);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CodingExerciseKind>("function");
  const [language, setLanguage] = useState<CodingLanguage>("javascript");
  return (
    <form
      className="grid gap-4 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        create.mutate(
          { lessonId, title: title.trim(), kind, language },
          { onSuccess: (exercise) => onCreated(exercise.id) },
        );
      }}
    >
      <label
        className="grid gap-1.5 text-xs font-semibold text-(--text-secondary)"
        htmlFor={`${ids}-title`}
      >
        Question title
        <input
          id={`${ids}-title`}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="e.g. Build an event emitter"
          className={`${FIELD} h-10`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-(--text-secondary)">
          Type
          <ThemedSelect<CodingExerciseKind>
            triggerClassName={SELECT_TRIGGER}
            value={kind}
            onValueChange={setKind}
            options={
              Object.entries(KIND_LABELS) as [CodingExerciseKind, string][]
            }
            ariaLabel="Type of question"
          />
        </label>
        <Segmented
          label="Language"
          value={language}
          options={LANGUAGES}
          onChange={setLanguage}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? <LoadingSpinnerIcon size={16} /> : null}
          Create and write it
        </Button>
        <Button
          type="button"
          variant="quiet"
          elevation="flat"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <span className="text-xs text-(--muted)">
          It starts blank. Learners see it on this lecture once you publish it.
        </span>
      </div>
      {create.error ? (
        <p role="alert" className="text-sm text-(--code-fail)">
          {getApiError(create.error).message}
        </p>
      ) : null}
    </form>
  );
}

function QuestionEditor({
  exerciseId,
  canManage,
  fromAi,
  onBack,
}: {
  exerciseId: string;
  canManage: boolean;
  /** AI just wrote it: check its tests at once. */
  fromAi: boolean;
  onBack: () => void;
}) {
  const exercise = useCodingExercise(exerciseId);
  // AI replaced the draft: the editor starts again from the new content
  // (and checks it), not from what it had loaded.
  const [generation, setGeneration] = useState(0);
  return (
    <div className="grid gap-4">
      <div>
        <Button
          variant="quiet"
          elevation="flat"
          className="-ml-2 h-9 px-2.5"
          onClick={onBack}
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          This lecture&apos;s questions
        </Button>
      </div>
      {exercise.isLoading ? (
        <span
          className="text-(--muted)"
          role="status"
          aria-label="Loading the question"
        >
          <LoadingSpinnerIcon size={22} />
        </span>
      ) : exercise.error || !exercise.data ? (
        <p role="alert" className="text-sm text-(--code-fail)">
          {exercise.error
            ? getApiError(exercise.error).message
            : "The question could not be found."}
        </p>
      ) : (
        <ExerciseWorkbench
          key={`${exercise.data.id}:${generation}`}
          exercise={exercise.data}
          embedded
          autoCheck={fromAi || generation > 0}
          onAiReplaced={() => setGeneration((value) => value + 1)}
          onDeleted={canManage ? onBack : undefined}
        />
      )}
    </div>
  );
}

/**
 * A lecture's Practice tab in the course editor, next to its Quiz: the
 * coding questions on this lecture. A question created here belongs to the
 * lecture; learners see it in the lessons list once it is published.
 */
export function LessonPracticePanel({
  courseId,
  lessonId,
  lessonTitle,
  canManage,
}: LessonPracticePanelProps) {
  const exercises = useCourseCodingExercises(courseId);
  const ai = useAiAvailability({ enabled: canManage });
  const [creating, setCreating] = useState<"blank" | "ai" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fromAi, setFromAi] = useState(false);
  const list = (exercises.data ?? []).filter((exercise) =>
    exercise.lectures.some((lecture) => lecture.lessonId === lessonId),
  );

  if (editingId)
    return (
      <div className={CODE_TONES}>
        <QuestionEditor
          exerciseId={editingId}
          canManage={canManage}
          fromAi={fromAi}
          onBack={() => {
            setEditingId(null);
            setFromAi(false);
          }}
        />
      </div>
    );

  return (
    <section
      aria-label={`Practice for ${lessonTitle}`}
      className={`grid gap-3 ${CODE_TONES}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent-ink,var(--accent))">
          <CodeGlyph size={17} weight="bold" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-(--text)">
            Coding practice
            {list.length ? (
              <span className="ml-1.5 text-xs font-normal text-(--muted)">
                {list.length}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-(--muted)">
            Learners open these from this lecture and solve them in the browser.
          </p>
        </div>
        {canManage && !creating ? (
          <div className="flex flex-wrap items-center gap-2">
            {ai.data?.available ? (
              <Button className="h-9 px-3.5" onClick={() => setCreating("ai")}>
                <Sparkle size={15} weight="fill" aria-hidden="true" />
                Create with AI
              </Button>
            ) : null}
            <Button
              className="h-9 px-3.5"
              variant={ai.data?.available ? "quiet" : "primary"}
              elevation={ai.data?.available ? "flat" : "raised"}
              onClick={() => setCreating("blank")}
            >
              <Plus size={15} weight="bold" aria-hidden="true" />
              Add question
            </Button>
          </div>
        ) : null}
      </div>

      {creating === "blank" ? (
        <NewQuestionForm
          courseId={courseId}
          lessonId={lessonId}
          onCreated={(id) => {
            setCreating(null);
            setEditingId(id);
          }}
          onCancel={() => setCreating(null)}
        />
      ) : null}
      {creating === "ai" ? (
        <AiQuestionForm
          courseId={courseId}
          lessonId={lessonId}
          lessonTitle={lessonTitle}
          onCreated={(id) => {
            setCreating(null);
            setFromAi(true);
            setEditingId(id);
          }}
          onCancel={() => setCreating(null)}
        />
      ) : null}

      {exercises.isLoading ? (
        <span
          className="text-(--muted)"
          role="status"
          aria-label="Loading practice questions"
        >
          <LoadingSpinnerIcon size={22} />
        </span>
      ) : exercises.error ? (
        <p role="alert" className="text-sm text-(--code-fail)">
          {getApiError(exercises.error).message}
        </p>
      ) : list.length === 0 && !creating ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--text)_3.5%,transparent)] px-4 py-6 text-center text-sm text-(--muted)">
          No practice questions on this lecture yet.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {list.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => setEditingId(exercise.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)] ${FOCUS_RING}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm! font-bold! break-words text-(--text)">
                    {exercise.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-(--muted)">
                    <span>{KIND_SHORT[exercise.kind]}</span>
                    <DifficultyLabel difficulty={exercise.difficulty} />
                  </span>
                </span>
                <StatusPill exercise={exercise} />
                <CaretRight
                  size={15}
                  weight="bold"
                  className="shrink-0 text-(--muted)"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default LessonPracticePanel;
