import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { LightbulbIcon as Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TimerIcon as Timer } from "@phosphor-icons/react/Timer";
import type {
  CodingFile,
  CodingLesson,
  CodingSubmissionSummary,
} from "@veolms/contracts";
import { Button } from "../../components/Button";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { TimeAgo } from "../../components/TimeAgo";
import { DiscussionMarkdown } from "../../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../../learning/discussion-editor/types";
import { getApiError } from "../../lib/api-error";
import {
  useCodingSolution,
  useCodingSubmissions,
} from "../../services/coding-practice";
import { CodeEditor, languageForPath } from "../editor/CodeEditor";
import {
  CODE_TONES,
  DifficultyLabel,
  EYEBROW,
  FOCUS_RING,
  HAIRLINE,
  MONO,
  PanelTabs,
} from "../shared/ui";
import { readOpenedHints, writeOpenedHints } from "./deviceStore";
import { clock } from "./usePracticeTimer";

export type ProblemTab = "problem" | "editorial" | "submissions" | "result";

function Markdown({ text, label }: { text: string; label: string }) {
  const content = useMemo(() => createDiscussionDraft(text), [text]);
  return <DiscussionMarkdown content={content} label={label} />;
}

function Examples({ lesson }: { lesson: CodingLesson }) {
  const { tests, entry } = lesson.exercise;
  if (tests.format !== "cases") return null;
  const visible = tests.cases.filter((test) => !test.hidden).slice(0, 4);
  if (visible.length === 0) return null;
  return (
    <section className="mt-5">
      <h3 className={EYEBROW}>Examples</h3>
      <ul className={`mt-2 grid gap-1.5 ${MONO} text-[0.8125rem]`}>
        {visible.map((test) => (
          <li
            key={test.id}
            className="rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3 py-2 break-all text-(--text)"
          >
            {entry.name}(
            {test.args.map((arg) => JSON.stringify(arg)).join(", ")})
            <span className="text-(--muted)"> → </span>
            {JSON.stringify(test.expected)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A row that opens and closes, as LeetCode's Topics and Hint rows. */
function Disclosure({
  icon,
  title,
  open,
  onToggle,
  locked,
  children,
}: {
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Why it cannot open yet. */
  locked?: string;
  children: ReactNode;
}) {
  return (
    <div className={`border-t ${HAIRLINE}`}>
      <button
        type="button"
        aria-expanded={open}
        disabled={Boolean(locked)}
        onClick={onToggle}
        className={`flex w-full cursor-pointer items-center gap-2 py-3 text-left text-sm! font-semibold! text-(--text) disabled:cursor-default ${FOCUS_RING}`}
      >
        <span aria-hidden="true" className="text-(--text-secondary)">
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        {locked ? (
          <span className="inline-flex items-center gap-1 text-xs font-normal text-(--muted)">
            <LockSimple size={13} aria-hidden="true" />
            {locked}
          </span>
        ) : (
          <CaretDown
            size={14}
            weight="bold"
            aria-hidden="true"
            className={`text-(--muted) transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && !locked ? <div className="pb-4 text-sm">{children}</div> : null}
    </div>
  );
}

/** Topics and hints at the end of the description, as LeetCode puts them. */
function DescriptionExtras({ lesson }: { lesson: CodingLesson }) {
  const assignmentId = lesson.assignment.id;
  const [opened, setOpened] = useState<string[]>(() =>
    readOpenedHints(assignmentId),
  );
  const [topicsOpen, setTopicsOpen] = useState(false);
  const failed = lesson.state.failedAttempts;
  const { hints, topics } = lesson.exercise;
  const toggle = (id: string) => {
    const next = opened.includes(id)
      ? opened.filter((item) => item !== id)
      : [...opened, id];
    setOpened(next);
    writeOpenedHints(assignmentId, next);
  };
  if (hints.length === 0 && topics.length === 0) return null;
  return (
    <div className="mt-6">
      {topics.length ? (
        <Disclosure
          icon={<Tag size={16} weight="bold" />}
          title="Topics"
          open={topicsOpen}
          onToggle={() => setTopicsOpen((value) => !value)}
        >
          <ul className="flex flex-wrap gap-1.5">
            {topics.map((topic) => (
              <li
                key={topic}
                className="rounded-full bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2.5 py-1 text-xs font-medium text-(--text-secondary)"
              >
                {topic}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {hints.map((hint, index) => {
        const unlocked =
          failed >= hint.unlockAfterFailedSubmits || lesson.state.passed;
        const left = hint.unlockAfterFailedSubmits - failed;
        return (
          <Disclosure
            key={hint.id}
            icon={<Lightbulb size={16} weight="bold" />}
            title={`Hint ${index + 1}`}
            open={opened.includes(hint.id)}
            onToggle={() => toggle(hint.id)}
            locked={
              unlocked
                ? undefined
                : `after ${left} more failed submit${left === 1 ? "" : "s"}`
            }
          >
            <Markdown text={hint.body} label={`Hint ${index + 1}`} />
          </Disclosure>
        );
      })}
    </div>
  );
}

function FileViewer({ files, label }: { files: CodingFile[]; label: string }) {
  const [active, setActive] = useState(files[0]?.path ?? "");
  const file = files.find((item) => item.path === active) ?? files[0];
  if (!file) return null;
  return (
    <div className={`overflow-hidden rounded-xl border ${HAIRLINE}`}>
      {files.length > 1 ? (
        <div
          className={`flex gap-1 overflow-x-auto border-b px-2 py-1 ${HAIRLINE}`}
        >
          {files.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => setActive(item.path)}
              className={`cursor-pointer rounded px-2 py-1 text-xs! font-semibold! font-mono! ${FOCUS_RING} ${item.path === file.path ? "bg-(--hover) text-(--text)" : "text-(--text-secondary)"}`}
            >
              {item.path}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-96 overflow-auto">
        <CodeEditor
          key={file.path}
          value={file.content}
          language={languageForPath(file.path)}
          readOnly
          label={`${label}, ${file.path}`}
        />
      </div>
    </div>
  );
}

function lockedReason(lesson: CodingLesson) {
  const { solutionPolicy, solutionAfterFailedSubmits } = lesson.assignment;
  if (solutionPolicy === "never")
    return "The instructor keeps the answer to this question private.";
  if (solutionPolicy === "after_pass")
    return "The editorial opens once you pass.";
  const left = solutionAfterFailedSubmits - lesson.state.failedAttempts;
  return `The editorial opens once you pass, or after ${left} more failed submit${left === 1 ? "" : "s"}. Try a hint first.`;
}

/** LeetCode's Editorial: the author's explanation and answer. */
function EditorialPanel({ lesson }: { lesson: CodingLesson }) {
  const solution = useCodingSolution(lesson);
  if (!lesson.exercise.hasEditorial)
    return (
      <p className="text-sm text-(--muted)">
        This question has no editorial yet.
      </p>
    );
  if (!lesson.state.solutionAvailable && !solution.data)
    return (
      <div className="grid justify-items-start gap-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] p-4">
        <LockSimple size={20} weight="bold" className="text-(--muted)" />
        <p className="text-sm text-(--text-secondary)">
          {lockedReason(lesson)}
        </p>
      </div>
    );
  if (!solution.data)
    return (
      <div className="grid justify-items-start gap-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] p-4">
        <p className="text-sm text-(--text-secondary)">
          {lesson.state.passed
            ? "You solved it. See how the instructor did it."
            : "Reading the editorial before you solve it gives the answer away. Try a hint first if you have not."}
        </p>
        <Button
          variant="quiet"
          elevation="flat"
          disabled={solution.isPending}
          onClick={() => solution.mutate()}
        >
          {solution.isPending ? <LoadingSpinnerIcon size={16} /> : null}
          Show the editorial
        </Button>
        {solution.error ? (
          <p role="alert" className="text-sm text-(--code-fail)">
            {getApiError(solution.error).message}
          </p>
        ) : null}
      </div>
    );
  return (
    <article className="grid gap-4">
      {solution.data.editorial.trim() ? (
        <div className="text-[0.9375rem]">
          <Markdown text={solution.data.editorial} label="Editorial" />
        </div>
      ) : null}
      {solution.data.files.length ? (
        <section className="grid gap-2">
          <h3 className={EYEBROW}>Answer</h3>
          <FileViewer files={solution.data.files} label="Answer" />
        </section>
      ) : null}
    </article>
  );
}

/**
 * Runtime as the result card counts it: the tests' own time (the whole
 * run, start-up included, for older rows without per-test times).
 */
function runtimeOf(submission: CodingSubmissionSummary): number | null {
  const timed = submission.results.filter((result) => result.ms !== undefined);
  if (timed.length)
    return timed.reduce((sum, result) => sum + (result.ms ?? 0), 0);
  return submission.durationMs;
}

function SubmissionDetail({
  submission,
  lesson,
  onBack,
  onLoadCode,
}: {
  submission: CodingSubmissionSummary;
  lesson: CodingLesson;
  onBack: () => void;
  onLoadCode: (files: CodingFile[]) => void;
}) {
  const names = new Map(
    (lesson.exercise.tests.format === "cases"
      ? lesson.exercise.tests.cases
      : lesson.exercise.tests.tests
    ).map((test) => [test.id, test]),
  );
  const failed = submission.results.filter((result) => !result.passed);
  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={onBack}
        className={`-ml-1 inline-flex w-fit cursor-pointer items-center gap-1 rounded text-sm! font-semibold! text-(--text-secondary) hover:text-(--text) ${FOCUS_RING}`}
      >
        <ArrowLeft size={14} weight="bold" aria-hidden="true" />
        All submissions
      </button>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3
          className={`text-lg font-bold ${submission.passed ? "text-(--code-pass)" : "text-(--code-fail)"}`}
        >
          {submission.passed
            ? submission.totalCount === 0
              ? "Done"
              : "Accepted"
            : "Wrong Answer"}
        </h3>
        <span className="text-sm text-(--text-secondary)">
          {submission.passedCount} / {submission.totalCount} tests passed
        </span>
        <TimeAgo
          value={submission.createdAt}
          className="text-sm text-(--muted)"
        />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {runtimeOf(submission) !== null ? (
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3 py-2">
            <dt className="text-xs text-(--muted)">Runtime</dt>
            <dd className="font-semibold text-(--text)">
              {runtimeOf(submission)} ms
            </dd>
          </div>
        ) : null}
        {submission.solveSeconds !== null ? (
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3 py-2">
            <dt className="text-xs text-(--muted)">Time on the timer</dt>
            <dd className="font-semibold text-(--text)">
              {clock(submission.solveSeconds)}
            </dd>
          </div>
        ) : null}
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3 py-2">
          <dt className="text-xs text-(--muted)">Version</dt>
          <dd className="font-semibold text-(--text)">
            {submission.versionNumber}
          </dd>
        </div>
      </dl>
      {failed.length ? (
        <ul className="grid gap-1.5">
          {failed.slice(0, 5).map((result) => {
            const test = names.get(result.id);
            return (
              <li
                key={result.id}
                className="rounded-lg bg-[color-mix(in_srgb,var(--code-fail)_7%,transparent)] px-3 py-2 text-sm"
              >
                <p className="font-semibold text-(--text)">
                  {test?.hidden ? "Hidden test" : (test?.name ?? result.id)}
                </p>
                {result.message && !test?.hidden ? (
                  <p
                    className={`${MONO} mt-0.5 text-xs break-words text-(--code-fail)`}
                  >
                    {result.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {submission.files ? (
        <section className="grid gap-2">
          <div className="flex items-center gap-2">
            <h3 className={EYEBROW}>Code</h3>
            <Button
              variant="quiet"
              elevation="flat"
              className="ml-auto h-8 px-3 text-xs"
              onClick={() => onLoadCode(submission.files!)}
            >
              Load into the editor
            </Button>
          </div>
          <FileViewer files={submission.files} label="Submitted code" />
        </section>
      ) : (
        <p className="text-sm text-(--muted)">
          The code of older failed submits is not kept.
        </p>
      )}
    </div>
  );
}

function SubmissionsList({
  lesson,
  onLoadCode,
}: {
  lesson: CodingLesson;
  onLoadCode: (files: CodingFile[]) => void;
}) {
  const submissions = useCodingSubmissions(lesson.assignment.id);
  const [openId, setOpenId] = useState<string | null>(null);
  if (submissions.isLoading)
    return (
      <span
        className="text-(--muted)"
        role="status"
        aria-label="Loading your submissions"
      >
        <LoadingSpinnerIcon size={20} />
      </span>
    );
  if (submissions.error)
    return (
      <p className="text-sm text-(--code-fail)">
        {getApiError(submissions.error).message}
      </p>
    );
  const rows = submissions.data ?? [];
  const open = rows.find((row) => row.id === openId);
  if (open)
    return (
      <SubmissionDetail
        submission={open}
        lesson={lesson}
        onBack={() => setOpenId(null)}
        onLoadCode={onLoadCode}
      />
    );
  if (rows.length === 0)
    return (
      <p className="text-sm text-(--muted)">
        No submissions yet. Submit (Ctrl + Enter) runs every test, hidden ones
        too.
      </p>
    );
  return (
    <ul
      className={`divide-y divide-[color-mix(in_srgb,var(--text)_7%,transparent)]`}
    >
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => setOpenId(row.id)}
            className={`flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 text-left hover:bg-(--hover) ${FOCUS_RING}`}
          >
            <span
              className={`min-w-28 text-sm! font-bold! ${row.passed ? "text-(--code-pass)" : "text-(--code-fail)"}`}
            >
              {row.passed
                ? row.totalCount === 0
                  ? "Done"
                  : "Accepted"
                : "Wrong Answer"}
            </span>
            <span className="text-xs text-(--text-secondary) tabular-nums">
              {row.passedCount}/{row.totalCount}
            </span>
            {runtimeOf(row) !== null ? (
              <span className="text-xs text-(--muted) tabular-nums">
                {runtimeOf(row)} ms
              </span>
            ) : null}
            <TimeAgo
              value={row.createdAt}
              className="ml-auto text-xs text-(--muted)"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** What the latest submit got, as LeetCode's result page after Submit. */
export interface SubmitResult {
  passed: boolean;
  passedCount: number;
  totalCount: number;
  /** The first failing test the learner may see. */
  firstFailure: { name: string; message?: string; hidden: boolean } | null;
  runtimeMs: number;
  solveSeconds: number | null;
  attempts: number;
  /** Still being sent (offline): shown from the run on this device. */
  pending: boolean;
}

function ResultPanel({ result }: { result: SubmitResult | null }) {
  if (!result)
    return (
      <p className="text-sm text-(--muted)">Submit to see your result here.</p>
    );
  const done = result.totalCount === 0;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {result.passed ? (
          <CheckCircle
            size={26}
            weight="fill"
            className="text-(--code-pass)"
            aria-hidden="true"
          />
        ) : null}
        <h3
          className={`text-xl font-bold ${result.passed ? "text-(--code-pass)" : "text-(--code-fail)"}`}
        >
          {done ? "Done" : result.passed ? "Accepted" : "Wrong Answer"}
        </h3>
        {!done ? (
          <span className="text-sm text-(--text-secondary)">
            {result.passedCount} / {result.totalCount} tests passed
          </span>
        ) : null}
        {result.pending ? (
          <span className="text-xs text-(--muted)">Sending…</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {!done ? (
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3 py-2">
            <dt className="text-xs text-(--muted)">Runtime</dt>
            <dd className="font-semibold text-(--text)">
              {result.runtimeMs} ms
            </dd>
          </div>
        ) : null}
        {result.solveSeconds !== null ? (
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3 py-2">
            <dt className="flex items-center gap-1 text-xs text-(--muted)">
              <Timer size={12} aria-hidden="true" /> Time taken
            </dt>
            <dd className="font-semibold text-(--text)">
              {clock(result.solveSeconds)}
            </dd>
          </div>
        ) : null}
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-3 py-2">
          <dt className="text-xs text-(--muted)">Attempts</dt>
          <dd className="font-semibold text-(--text)">{result.attempts}</dd>
        </div>
      </dl>
      {result.firstFailure ? (
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--code-fail)_7%,transparent)] px-3 py-2.5 text-sm">
          <p className="font-semibold text-(--text)">
            {result.firstFailure.hidden
              ? "A hidden test failed"
              : `Failed: ${result.firstFailure.name}`}
          </p>
          {result.firstFailure.message ? (
            <p
              className={`${MONO} mt-1 text-xs break-words text-(--code-fail)`}
            >
              {result.firstFailure.message}
            </p>
          ) : null}
        </div>
      ) : null}
      {result.passed && !done ? (
        <p className="text-sm text-(--text-secondary)">
          Solved. It counts in your progress and streak. Try the next question,
          or read the editorial to compare approaches.
        </p>
      ) : null}
    </div>
  );
}

export function ProblemPane({
  lesson,
  idPrefix,
  tab,
  onTabChange,
  onLoadCode,
  actions,
  result,
}: {
  lesson: CodingLesson;
  idPrefix: string;
  tab: ProblemTab;
  onTabChange: (tab: ProblemTab) => void;
  onLoadCode: (files: CodingFile[]) => void;
  /** Buttons at the end of the tab row (maximise). */
  actions?: ReactNode;
  /** The latest submit's result, once there is one. */
  result: SubmitResult | null;
}) {
  const { exercise, state } = lesson;
  const machine = exercise.settings.mode === "machine_coding";
  return (
    <div className={`flex h-full min-h-0 flex-col ${CODE_TONES}`}>
      <PanelTabs<ProblemTab>
        idPrefix={idPrefix}
        label="Question"
        active={tab}
        onChange={onTabChange}
        trailing={actions}
        tabs={[
          {
            id: "problem",
            label: "Description",
            icon: <FileText size={15} weight="bold" aria-hidden="true" />,
          },
          {
            id: "editorial",
            label: "Editorial",
            icon: <BookOpenText size={15} weight="bold" aria-hidden="true" />,
          },
          {
            id: "submissions",
            label: "Submissions",
            icon: (
              <ClockCounterClockwise
                size={15}
                weight="bold"
                aria-hidden="true"
              />
            ),
          },
          ...(result
            ? [
                {
                  id: "result" as const,
                  label: "Result",
                  icon: <Flag size={15} weight="bold" aria-hidden="true" />,
                },
              ]
            : []),
        ]}
      />
      <div
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
      >
        {tab === "problem" ? (
          <article>
            <h2 className="text-lg font-bold text-(--text) text-balance">
              {exercise.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DifficultyLabel difficulty={exercise.difficulty} />
              {machine ? (
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 text-xs font-semibold text-(--accent-ink,var(--accent))">
                  <Timer size={12} weight="bold" aria-hidden="true" />
                  Machine coding · {exercise.settings.timeLimitMinutes ??
                    45}{" "}
                  min
                </span>
              ) : (
                <span className="text-xs font-medium text-(--muted)">
                  About {exercise.estimatedMinutes} min
                </span>
              )}
              {state.passed ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-(--code-pass)">
                  <CheckCircle size={13} weight="fill" aria-hidden="true" />
                  Solved
                </span>
              ) : state.attempts > 0 ? (
                <span className="text-xs font-semibold text-(--code-warn)">
                  Attempted
                </span>
              ) : null}
              {lesson.assignment.lessonTitle ? (
                <span className="text-xs text-(--muted)">
                  · From the lecture “{lesson.assignment.lessonTitle}”
                </span>
              ) : null}
            </div>
            <div className="mt-4 text-[0.9375rem]">
              <Markdown text={exercise.statement} label="Problem" />
            </div>
            <Examples lesson={lesson} />
            {exercise.settings.bestOnDesktop ? (
              <p className="mt-5 text-sm text-(--muted) sm:hidden">
                This question is easier on a bigger screen, but it works here
                too.
              </p>
            ) : null}
            <DescriptionExtras lesson={lesson} />
          </article>
        ) : null}
        {tab === "editorial" ? <EditorialPanel lesson={lesson} /> : null}
        {tab === "submissions" ? (
          <SubmissionsList lesson={lesson} onLoadCode={onLoadCode} />
        ) : null}
        {tab === "result" ? <ResultPanel result={result} /> : null}
      </div>
    </div>
  );
}
