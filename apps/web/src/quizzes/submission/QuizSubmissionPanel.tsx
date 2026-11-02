import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardTextIcon as ClipboardText } from "@phosphor-icons/react/ClipboardText";
import type { QuizSubmission } from "@veolms/contracts";
import { Button } from "../../components/Button";
import {
  EmptyState,
  LoadingRows,
  MetricTile,
} from "../../components/analytics/StatTiles";
import {
  SlideOverPanel,
  SlideOverStepButtons,
} from "../../components/SlideOverPanel";
import { useBackDismiss } from "../../navigation/useBackDismiss";
import { useQuizSubmission } from "../../services/quizzes";
import { ThemedSelect, type ThemedSelectOption } from "../../ThemedSelect";
import { formatMarksOutOf } from "../quizMarks";
import { QuizSubmissionAnswer } from "./QuizSubmissionAnswer";

export interface QuizSubmissionStep {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface QuizSubmissionPanelProps {
  assignmentId: string;
  studentId: string;
  /** Shown while the submission loads; the server's name wins after. */
  studentName: string;
  /** Previous and next student with an attempt, in the list's order. */
  step: QuizSubmissionStep;
  onClose: () => void;
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Escape closes the panel and the arrow keys step to the previous or next
 * student, the same keys as the Orders page's details panel. Ignored while
 * typing or while a menu (the attempt picker) is open.
 */
function usePanelKeys(onClose: () => void, step: QuizSubmissionStep) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]",
        ) ||
        document.querySelector("dialog[open], [role=alertdialog]")
      )
        return;
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && step.hasPrev) step.onPrev();
      else if (event.key === "ArrowRight" && step.hasNext) step.onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, step]);
}

/**
 * One student's quiz attempt as the course team reviews it: every question
 * with the answer given, the answer key, the marks and the totals. Opened
 * from a student in an assessment's "Student outcomes" list.
 */
export function QuizSubmissionPanel({
  assignmentId,
  studentId,
  studentName,
  step,
  onClose,
}: QuizSubmissionPanelProps) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const submission = useQuizSubmission(assignmentId, studentId, attemptId);
  const data = submission.data;
  const closeRef = useRef<HTMLButtonElement>(null);

  usePanelKeys(onClose, step);
  // The panel covers the page, so Back closes it rather than leaving Quizzes.
  useBackDismiss({ open: true, onDismiss: onClose });
  // Focus moves into the panel and returns to the student row on close.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  const name = data?.student.name ?? studentName;

  return (
    <SlideOverPanel
      label={`Submission by ${name}`}
      title={<span className="line-clamp-1">Submission by {name}</span>}
      onClose={onClose}
      closeLabel="Close submission"
      closeRef={closeRef}
      className="max-w-180"
      headerActions={
        <SlideOverStepButtons
          hasPrev={step.hasPrev}
          hasNext={step.hasNext}
          onPrev={step.onPrev}
          onNext={step.onNext}
          noun="submission"
        />
      }
      headerContent={
        data ? (
          <SubmissionHeader submission={data} onAttemptChange={setAttemptId} />
        ) : null
      }
    >
      <div
        className={`min-h-0 flex-1 overflow-y-auto p-5 transition-opacity sm:p-6 ${submission.isPlaceholderData ? "opacity-60" : ""}`}
        aria-busy={submission.isFetching}
      >
        {data ? (
          <SubmissionBody submission={data} />
        ) : submission.isError ? (
          <EmptyState
            icon={<ClipboardText size={22} />}
            title="Submission could not be loaded"
            message="Please check your connection and try again."
            action={
              <Button onClick={() => void submission.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <LoadingRows />
        )}
      </div>
    </SlideOverPanel>
  );
}

function ResultPill({ passed }: { passed: boolean | null }) {
  const [label, className] =
    passed === null
      ? [
          "In progress",
          "bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--muted)",
        ]
      : passed
        ? ["Passed", "bg-emerald-500/12 text-emerald-500"]
        : ["Failed", "bg-rose-500/12 text-rose-500"];
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function SubmissionHeader({
  submission,
  onAttemptChange,
}: {
  submission: QuizSubmission;
  onAttemptChange: (attemptId: string) => void;
}) {
  const { attempt, attempts } = submission;
  const attemptOptions: readonly ThemedSelectOption[] = useMemo(
    () =>
      attempts.map((item) => [
        item.id,
        `Attempt ${item.attemptNumber} · ${item.score === null ? "In progress" : formatMarksOutOf(item.score, item.maxScore)}`,
        { subtitle: formatDate(item.submittedAt) },
      ]),
    [attempts],
  );
  const context = submission.lessonTitle ?? submission.quizTitle;

  return (
    <div className="mt-1.5 grid gap-3">
      <p className="truncate text-sm text-(--muted)" title={context}>
        {context}
        {submission.lessonTitle &&
        submission.quizTitle !== submission.lessonTitle ? (
          <span> · {submission.quizTitle}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ResultPill passed={attempt.passed} />
        <span className="text-xs text-(--muted)">
          Pass mark {percent(submission.passPercentage)}
        </span>
        <span className="ml-auto">
          {attempts.length > 1 ? (
            <ThemedSelect
              value={attempt.id}
              onValueChange={onAttemptChange}
              options={attemptOptions}
              ariaLabel="Choose an attempt"
              triggerClassName="!h-8 !rounded-[9px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-2.5 !text-xs !font-medium !text-(--text) focus:!border-(--accent)"
            />
          ) : (
            <span className="text-xs font-semibold text-(--muted)">
              Attempt {attempt.attemptNumber}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function SubmissionBody({ submission }: { submission: QuizSubmission }) {
  const { attempt } = submission;
  const open = attempt.status === "in_progress";

  return (
    <>
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-(--border) p-3.5 sm:grid-cols-4 sm:p-4">
        <MetricTile
          label="Marks"
          value={formatMarksOutOf(attempt.score, attempt.maxScore)}
        />
        <MetricTile label="Percentage" value={percent(attempt.percentage)} />
        <MetricTile
          label="Correct"
          value={
            attempt.correctCount === null
              ? "—"
              : `${attempt.correctCount} of ${attempt.questionCount}`
          }
        />
        <MetricTile label="Submitted" value={formatDate(attempt.submittedAt)} />
      </div>
      <p className="mt-2.5 text-xs text-(--muted)">
        Started {formatDateTime(attempt.startedAt)}
        {attempt.submittedAt
          ? ` · Submitted ${formatDateTime(attempt.submittedAt)}`
          : null}
        {attempt.status === "expired" ? " · Closed when time ran out" : null}
      </p>
      {open ? (
        <p
          role="status"
          className="mt-4 rounded-lg bg-(--canvas) px-3.5 py-3 text-xs leading-relaxed text-(--muted)"
        >
          This attempt is still open. The answers saved so far are shown without
          marks.
        </p>
      ) : null}

      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-(--text)">Responses</h3>
        {attempt.answersRecorded ? (
          <p className="text-xs text-(--muted)">
            {attempt.answeredCount} of {attempt.questionCount} answered
          </p>
        ) : null}
      </div>
      {!attempt.answersRecorded ? (
        // An imported retake: the score above is real, the answers are not
        // known, so no question is shown as unanswered or wrong.
        <EmptyState
          compact
          icon={<ClipboardText size={22} />}
          title="Answers not available"
          message="This attempt was imported with its score and dates only, so the answers given are not on record."
        />
      ) : attempt.questions.length ? (
        <ol className="mt-3 grid gap-2.5">
          {attempt.questions.map((question, index) => (
            <QuizSubmissionAnswer
              key={question.id}
              question={question}
              index={index}
            />
          ))}
        </ol>
      ) : (
        <EmptyState
          compact
          icon={<ClipboardText size={22} />}
          title="No questions"
          message="This quiz version has no questions to show."
        />
      )}
    </>
  );
}
