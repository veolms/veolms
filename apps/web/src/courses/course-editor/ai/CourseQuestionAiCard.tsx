import { useId, useMemo, useState } from "react";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react/ListChecks";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import {
  QUESTION_GENERATION_COST_USD,
  type QuestionGenerationItem,
  type QuestionGenerationJob,
  type QuizAiLevel,
  type QuizAiQuestionType,
} from "@veolms/contracts";
import { Button } from "../../../components/Button";
import { Checkbox } from "../../../components/Checkbox";
import { ElevatedCard } from "../../../components/ElevatedCard";
import { FilterChips } from "../../../components/FilterChips";
import { LoadingSpinnerIcon } from "../../../components/LoadingSpinner";
import { FIELD } from "../../../coding-practice/shared/ui";
import { getApiError } from "../../../lib/api-error";
import { useAiAvailability } from "../../../services/ai";
import { useCapabilities } from "../../../services/authorization";
import {
  useCancelQuestionJob,
  useLatestQuestionJob,
  usePublishGeneratedQuizzes,
  useStartQuestionJob,
} from "../../../services/question-ai";

export interface QuestionAiSection {
  id: string;
  title: string;
  lessonIds: string[];
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

const STATUS_WORDS: Record<QuestionGenerationItem["status"], string> = {
  pending: "Waiting",
  running: "Writing…",
  done: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

const money = (value: number) =>
  value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(value < 10 ? 1 : 0)}`;

/** A small status chip, the curriculum's look. */
function Chip({
  tone,
  children,
}: {
  tone: "draft" | "live" | "muted" | "fail";
  children: React.ReactNode;
}) {
  const tones = {
    draft:
      "bg-[color-mix(in_srgb,#f59e0b_15%,transparent)] text-[color-mix(in_srgb,#f59e0b_55%,var(--text))]",
    live: "bg-[color-mix(in_srgb,var(--success,#22c55e)_15%,transparent)] text-[color-mix(in_srgb,var(--success,#22c55e)_55%,var(--text))]",
    muted:
      "bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--text-secondary)",
    fail: "bg-[color-mix(in_srgb,var(--danger,#e11d48)_14%,transparent)] text-[color-mix(in_srgb,var(--danger,#e11d48)_60%,var(--text))]",
  };
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[0.6875rem] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** The settings form: what to make, how, for which sections. */
function SetupForm({
  sections,
  starting,
  error,
  onStart,
  onCancel,
}: {
  sections: QuestionAiSection[];
  starting: boolean;
  error: string | null;
  onStart: (settings: {
    quizzes: boolean;
    coding: boolean;
    questionsPerQuiz: number;
    level: QuizAiLevel;
    types: QuizAiQuestionType[];
    sectionIds: string[];
    skipExisting: boolean;
    guidance?: string;
  }) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [quizzes, setQuizzes] = useState(true);
  const [coding, setCoding] = useState(true);
  const [count, setCount] = useState(5);
  const [level, setLevel] = useState<QuizAiLevel>("mixed");
  const [types, setTypes] = useState<QuizAiQuestionType[]>([
    "single_choice",
    "multiple_choice",
    "true_false",
  ]);
  const [allSections, setAllSections] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [guidance, setGuidance] = useState("");

  const lectures = useMemo(
    () =>
      sections
        .filter((section) => allSections || chosen.includes(section.id))
        .reduce((sum, section) => sum + section.lessonIds.length, 0),
    [sections, allSections, chosen],
  );
  const low =
    lectures *
    ((quizzes ? QUESTION_GENERATION_COST_USD.quizPerLecture : 0) +
      (coding ? QUESTION_GENERATION_COST_USD.codingPerLecture * 0.4 : 0));
  const high =
    lectures *
    ((quizzes ? QUESTION_GENERATION_COST_USD.quizPerLecture * 1.5 : 0) +
      (coding ? QUESTION_GENERATION_COST_USD.codingPerLecture : 0));
  const minutes = Math.max(
    1,
    Math.round((lectures * ((quizzes ? 40 : 0) + (coding ? 70 : 0))) / 60),
  );
  const canStart =
    (quizzes || coding) &&
    lectures > 0 &&
    (allSections || chosen.length > 0) &&
    !starting;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
        <span className="pt-0.5 text-xs font-semibold text-(--text-secondary)">
          Make
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Checkbox
            checked={quizzes}
            onCheckedChange={setQuizzes}
            label="A quiz for each lecture"
          />
          <Checkbox
            checked={coding}
            onCheckedChange={setCoding}
            label="A coding question where the lecture teaches code"
          />
        </div>

        {quizzes ? (
          <>
            <label
              htmlFor={`${ids}-count`}
              className="pt-2 text-xs font-semibold text-(--text-secondary)"
            >
              Questions per quiz
            </label>
            <input
              id={`${ids}-count`}
              type="number"
              min={3}
              max={10}
              value={count}
              onChange={(event) =>
                setCount(
                  Math.min(10, Math.max(3, Number(event.target.value) || 3)),
                )
              }
              className={`${FIELD} h-10 w-24!`}
            />
            <span className="pt-1.5 text-xs font-semibold text-(--text-secondary)">
              Level
            </span>
            <FilterChips
              ariaLabel="How hard"
              value={level}
              onChange={setLevel}
              items={LEVELS}
              wrap
            />
            <span className="pt-0.5 text-xs font-semibold text-(--text-secondary)">
              Quiz questions
            </span>
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
          </>
        ) : null}

        <span className="pt-0.5 text-xs font-semibold text-(--text-secondary)">
          Sections
        </span>
        <div className="grid gap-2">
          <Checkbox
            checked={allSections}
            onCheckedChange={setAllSections}
            label="All sections"
          />
          {allSections ? null : (
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-2.5">
              {sections.map((section) => (
                <Checkbox
                  key={section.id}
                  checked={chosen.includes(section.id)}
                  onCheckedChange={(checked) =>
                    setChosen((current) =>
                      checked
                        ? [...current, section.id]
                        : current.filter((item) => item !== section.id),
                    )
                  }
                  label={`${section.title} (${section.lessonIds.length})`}
                />
              ))}
            </div>
          )}
          <Checkbox
            checked={skipExisting}
            onCheckedChange={setSkipExisting}
            label="Skip lectures that already have their questions"
          />
        </div>

        <label
          htmlFor={`${ids}-note`}
          className="pt-2 text-xs font-semibold text-(--text-secondary)"
        >
          Note for the AI
        </label>
        <textarea
          id={`${ids}-note`}
          value={guidance}
          maxLength={1_000}
          rows={2}
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="Optional, e.g. My students are beginners; keep the English simple."
          className={`${FIELD} min-h-16 resize-y py-2`}
        />
      </div>

      <p className="text-xs text-(--muted)">
        {lectures} lecture{lectures === 1 ? "" : "s"} · about {money(low)} to{" "}
        {money(high)} of AI use · about {minutes} minute
        {minutes === 1 ? "" : "s"}. It runs on the server: you can leave this
        page and come back.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-(--danger,#e11d48)">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-9 px-3.5"
          disabled={!canStart}
          onClick={() =>
            onStart({
              quizzes,
              coding,
              questionsPerQuiz: count,
              level,
              types,
              sectionIds: allSections ? [] : chosen,
              skipExisting,
              guidance: guidance.trim() || undefined,
            })
          }
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

/** One lecture of a run: what was made, with ways to check it. */
function ItemRow({
  item,
  courseId,
  jobRunning,
  onOpenLesson,
}: {
  item: QuestionGenerationItem;
  courseId: string;
  /** False once the run stopped: a lecture not reached is "Not done". */
  jobRunning: boolean;
  onOpenLesson: (lessonId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_2.5%,transparent)] px-3 py-2.5">
      <span className="w-6 shrink-0 text-xs font-bold text-(--muted) tabular-nums">
        {item.position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-(--text)">
          {item.lessonTitle}
        </span>
        {item.message ? (
          <span className="block truncate text-xs text-(--muted)">
            {item.message}
          </span>
        ) : item.sectionTitle ? (
          <span className="block truncate text-xs text-(--muted)">
            {item.sectionTitle}
          </span>
        ) : null}
      </span>
      {item.quiz ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary)">
          <ListChecks size={14} weight="bold" aria-hidden="true" />
          {item.quiz.questionCount} questions
          <Chip tone={item.quiz.status === "published" ? "live" : "draft"}>
            {item.quiz.status === "published" ? "Published" : "Draft"}
          </Chip>
        </span>
      ) : null}
      {item.coding ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary)">
          <CodeGlyph size={14} weight="bold" aria-hidden="true" />
          <Chip tone={item.coding.status === "published" ? "live" : "draft"}>
            {item.coding.status === "published" ? "Published" : "Draft"}
          </Chip>
          {item.coding.assignmentId ? (
            <a
              href={`/practice/${encodeURIComponent(courseId)}/${encodeURIComponent(item.coding.assignmentId)}?preview=1`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-(--accent) no-underline hover:underline"
            >
              Try as student
              <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
            </a>
          ) : null}
        </span>
      ) : null}
      {item.status === "done" || item.status === "skipped" ? null : (
        <Chip
          tone={
            item.status === "failed"
              ? "fail"
              : item.status === "running" && jobRunning
                ? "draft"
                : "muted"
          }
        >
          {!jobRunning &&
          (item.status === "pending" || item.status === "running")
            ? "Not done"
            : STATUS_WORDS[item.status]}
        </Chip>
      )}
      {item.quiz || item.coding ? (
        <Button
          variant="quiet"
          elevation="flat"
          className="h-8 px-2.5 text-xs"
          onClick={() => onOpenLesson(item.lessonId)}
        >
          Review
        </Button>
      ) : null}
    </li>
  );
}

/**
 * The curriculum's "Create quizzes and coding questions with AI": one press
 * makes a draft quiz for every lecture, and a coding question where the
 * lecture teaches code, in course order. It runs on the server; this card
 * shows how far it got and lists what was made, to review (open the
 * lecture to edit by hand or with AI, try a coding question as a student)
 * and publish. Students see nothing until it is published.
 */
export function CourseQuestionAiCard({
  courseId,
  sections,
  onOpenLesson,
}: {
  courseId: string;
  sections: QuestionAiSection[];
  onOpenLesson: (lessonId: string) => void;
}) {
  const capabilities = useCapabilities();
  const available =
    (useAiAvailability().data?.available ?? false) &&
    capabilities.can("quiz.create");
  const latest = useLatestQuestionJob(available ? courseId : null);
  const start = useStartQuestionJob(courseId);
  const cancel = useCancelQuestionJob(courseId);
  const publish = usePublishGeneratedQuizzes(courseId);
  const [setup, setSetup] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const job: QuestionGenerationJob | null = latest.data ?? null;

  if (!available) return null;
  const running = job?.status === "queued" || job?.status === "running";
  const draftQuizzes =
    job?.items.filter((item) => item.quiz?.status === "draft").length ?? 0;
  const share = job && job.totalItems ? job.doneItems / job.totalItems : 0;

  return (
    <ElevatedCard as="section" padded className="grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent)">
          <Sparkle size={18} weight="fill" aria-hidden="true" />
        </span>
        {/* Wide enough to keep its words together; the button wraps
            under it on a phone. */}
        <div className="min-w-[min(100%,16rem)] flex-1">
          <h3 className="m-0 text-base font-bold text-(--text)">
            Quizzes and coding questions with AI
          </h3>
          <p className="m-0 mt-0.5 text-sm text-(--muted)">
            AI reads every lecture (its notes and what the video says) and
            writes a quiz, and a coding question where the lecture teaches code,
            in course order. Everything is a draft until you publish it.
          </p>
        </div>
        {!setup && !running ? (
          <Button className="h-9 px-3.5" onClick={() => setSetup(true)}>
            {job ? "Run again" : "Set up"}
          </Button>
        ) : null}
      </div>

      {setup && !running ? (
        <SetupForm
          sections={sections}
          starting={start.isPending}
          error={start.error ? getApiError(start.error).message : null}
          onCancel={() => setSetup(false)}
          onStart={(settings) =>
            start.mutate(settings, { onSuccess: () => setSetup(false) })
          }
        />
      ) : null}

      {job ? (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {running ? (
                <LoadingSpinnerIcon size={15} />
              ) : job.status === "done" ? (
                <CheckCircle
                  size={16}
                  weight="fill"
                  className="text-(--success,#22c55e)"
                  aria-hidden="true"
                />
              ) : (
                <WarningCircle
                  size={16}
                  weight="fill"
                  className="text-(--danger,#e11d48)"
                  aria-hidden="true"
                />
              )}
              <span className="font-semibold text-(--text)">
                {running
                  ? `Writing questions: ${job.doneItems} of ${job.totalItems} lectures`
                  : job.status === "done"
                    ? `Done: ${job.quizzesCreated} quiz${job.quizzesCreated === 1 ? "" : "zes"} and ${job.codingCreated} coding question${job.codingCreated === 1 ? "" : "s"}`
                    : job.status === "cancelled"
                      ? `Stopped after ${job.doneItems} of ${job.totalItems} lectures`
                      : "Stopped"}
              </span>
              {job.skippedItems ? (
                <span className="text-xs text-(--muted)">
                  {job.skippedItems} skipped
                </span>
              ) : null}
              {job.failedItems ? (
                <span className="text-xs text-(--danger,#e11d48)">
                  {job.failedItems} failed
                </span>
              ) : null}
              <span className="ml-auto flex gap-2">
                {running ? (
                  <Button
                    variant="quiet"
                    elevation="flat"
                    className="h-8 px-3"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(job.id)}
                  >
                    Stop
                  </Button>
                ) : draftQuizzes > 0 ? (
                  confirmPublish ? (
                    <>
                      <Button
                        className="h-8 px-3"
                        disabled={publish.isPending}
                        onClick={() =>
                          publish.mutate(
                            { jobId: job.id },
                            { onSuccess: () => setConfirmPublish(false) },
                          )
                        }
                      >
                        Publish {draftQuizzes} quiz
                        {draftQuizzes === 1 ? "" : "zes"} now
                      </Button>
                      <Button
                        variant="quiet"
                        elevation="flat"
                        className="h-8 px-3"
                        onClick={() => setConfirmPublish(false)}
                      >
                        Not yet
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="quiet"
                      elevation="flat"
                      className="h-8 px-3"
                      onClick={() => setConfirmPublish(true)}
                    >
                      Publish all quizzes
                    </Button>
                  )
                ) : null}
              </span>
            </div>
            {running ? (
              <span className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <span
                  className="block h-full rounded-full bg-(--accent) transition-[width] duration-500"
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </span>
            ) : null}
            {job.error ? (
              <p role="alert" className="text-sm text-(--danger,#e11d48)">
                {job.error}
              </p>
            ) : null}
            {confirmPublish ? (
              <p className="text-xs text-(--muted)">
                Students will see these quizzes on their lectures. Coding
                questions are checked and published one by one in each
                lecture&apos;s Practice tab.
              </p>
            ) : null}
            {publish.error ? (
              <p role="alert" className="text-sm text-(--danger,#e11d48)">
                {getApiError(publish.error).message}
              </p>
            ) : null}
          </div>
          <ul className="grid max-h-[28rem] gap-1.5 overflow-y-auto">
            {job.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                courseId={courseId}
                jobRunning={running}
                onOpenLesson={onOpenLesson}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </ElevatedCard>
  );
}

export default CourseQuestionAiCard;
