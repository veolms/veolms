import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { LearnerQuizAttempt, QuizResult } from "@veolms/contracts";
import { Button } from "../components/Button";
import { AutosaveStatus, useAutosync } from "../lib/autosync";
import { useQuizAttempt } from "../services/quizzes/quizzes.queries";
import { quizzesService } from "../services/quizzes/quizzes.service";
import {
  useStartQuizAttempt,
  useSubmitQuizAttempt,
} from "../services/quizzes/quizzes.mutations";
import {
  answeredQuestionCount,
  formatQuizRemainingTime,
  hasAnsweredEveryQuestion,
  toBulkQuizAnswers,
  type QuizAttemptDraft,
} from "./quizDraft";

interface QuizAttemptPanelProps {
  assignmentId: string;
  activeAttemptId?: string | null;
  maxAttempts?: number;
  onContinueCourse?: () => void;
}

export function QuizAttemptPanel({
  assignmentId,
  activeAttemptId = null,
  maxAttempts = 1,
  onContinueCourse,
}: QuizAttemptPanelProps) {
  const [attemptId, setAttemptId] = useState(activeAttemptId);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const expiryRefreshRef = useRef<string | null>(null);
  const start = useStartQuizAttempt();
  const submit = useSubmitQuizAttempt();
  const attemptQuery = useQuizAttempt(attemptId);
  const attempt = attemptQuery.data;
  const initialValue = useMemo<QuizAttemptDraft>(
    () => ({
      answers: attempt?.answers ?? {},
      currentQuestionId: attempt?.questions[0]?.id ?? null,
    }),
    [attempt?.answers, attempt?.questions],
  );
  const autosync = useAutosync<
    QuizAttemptDraft,
    { saved: true; answerCount: number }
  >({
    key: {
      entity: "quiz-attempt",
      entityId: attemptId ?? "pending",
      scope: "answers",
    },
    initialValue,
    enabled: Boolean(attempt),
    validate: (draft) => {
      if (!attempt) return { valid: false, message: "Quiz is still loading." };
      return hasAnsweredEveryQuestion(attempt, draft)
        ? true
        : { valid: false, message: "Answer every question before syncing." };
    },
    sync: (draft) =>
      quizzesService.saveAnswers(attempt!.id, toBulkQuizAnswers(draft)),
  });
  const autosyncValue = autosync.value;
  const autosyncIsRestoring = autosync.isRestoring;
  const flushAutosync = autosync.flush;

  useEffect(() => {
    if (attemptId || start.isPending) return;
    start.mutate(assignmentId, { onSuccess: (next) => setAttemptId(next.id) });
  }, [assignmentId, attemptId, start]);

  useEffect(() => {
    if (
      !attempt ||
      autosyncIsRestoring ||
      !hasAnsweredEveryQuestion(attempt, autosyncValue)
    )
      return;
    void flushAutosync().catch(() => undefined);
  }, [attempt, autosyncIsRestoring, autosyncValue, flushAutosync]);

  const refetchAttempt = attemptQuery.refetch;
  useEffect(() => {
    if (!attempt?.expiresAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [attempt?.expiresAt]);

  const expiresAtMs = attempt?.expiresAt ? Date.parse(attempt.expiresAt) : null;
  const remainingSeconds =
    expiresAtMs === null
      ? null
      : Math.max(0, Math.ceil((expiresAtMs - now) / 1_000));
  const timeExpired = remainingSeconds === 0;

  useEffect(() => {
    if (
      !attempt ||
      !timeExpired ||
      attempt.status !== "in_progress" ||
      expiryRefreshRef.current === attempt.id
    )
      return;
    expiryRefreshRef.current = attempt.id;
    void refetchAttempt();
  }, [attempt, refetchAttempt, timeExpired]);

  const retry = () => {
    if (!result || result.attemptNumber >= maxAttempts) return;
    autosync.discard();
    expiryRefreshRef.current = null;
    setResult(null);
    setAttemptId(null);
  };

  if (result) {
    return (
      <QuizResultCard
        result={result}
        onContinueCourse={onContinueCourse}
        onRetry={result.attemptNumber < maxAttempts ? retry : undefined}
      />
    );
  }
  if (start.error || attemptQuery.error) {
    const error = start.error ?? attemptQuery.error;
    return (
      <section
        className="mx-auto max-w-3xl rounded-[14px] sm:rounded-[20px] border border-red-500/20 bg-(--card-surface,var(--surface)) p-3.5 sm:p-6 text-(--text)"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <p role="alert" className="text-red-400">Unable to open this Quiz. {error?.message}</p>
      </section>
    );
  }
  if (attemptQuery.isLoading || start.isPending || !attempt) {
    return (
      <section
        className="mx-auto max-w-3xl rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 sm:p-6 text-(--muted)"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <p role="status">Loading Quiz…</p>
      </section>
    );
  }
  if (attempt.status !== "in_progress") {
    return (
      <section
        className="mx-auto max-w-3xl rounded-[14px] sm:rounded-[20px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 sm:p-6 text-(--text)"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <p className="text-(--muted)">This attempt is no longer active.</p>
      </section>
    );
  }
  const currentIndex = Math.max(
    0,
    attempt.questions.findIndex(
      (question) => question.id === autosync.value.currentQuestionId,
    ),
  );
  const question = attempt.questions[currentIndex]!;
  const selected = autosync.value.answers[question.id]?.selectedOptionIds ?? [];
  const complete = hasAnsweredEveryQuestion(attempt, autosync.value);
  const setSelected = (optionId: string) =>
    autosync.update((current) => {
      const existing = current.answers[question.id]?.selectedOptionIds ?? [];
      const next =
        question.questionType === "multiple_choice"
          ? existing.includes(optionId)
            ? existing.filter((id) => id !== optionId)
            : [...existing, optionId]
          : [optionId];
      return {
        ...current,
        answers: {
          ...current.answers,
          [question.id]: { selectedOptionIds: next },
        },
      };
    });
  const goTo = (index: number) =>
    autosync.update({
      currentQuestionId:
        attempt.questions[
          Math.max(0, Math.min(index, attempt.questions.length - 1))
        ]?.id ?? question.id,
    });
  const handleSubmit = async () => {
    if (!complete || !attemptId || submit.isPending || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await autosync.flush();
      const next = await submit.mutateAsync(attemptId);
      setResult(next);
      autosync.discard();
    } catch {
      /* Autosync keeps the draft for retry. */
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestSubmit = () => {
    if (!complete || timeExpired || isSubmitting || submit.isPending) return;
    setShowSubmitConfirmation(true);
  };

  return (
    <section className="mx-auto w-full max-w-4xl text-(--text)">
      <div
        className="overflow-hidden rounded-[16px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) transition-all"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <header className="border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-4 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div>
              <p className="text-[0.68rem] sm:text-xs font-bold uppercase tracking-[0.16em] text-(--accent)">
                Assessment
              </p>
              <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
                Question {currentIndex + 1} of {attempt.questions.length}
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  timeExpired
                    ? "border-red-500/30 bg-red-500/12 text-red-400"
                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] text-(--muted)"
                }`}
                style={{ boxShadow: "var(--card-compact-shadow)" }}
              >
                <Clock size={14} weight="bold" aria-hidden="true" />
                {remainingSeconds === null
                  ? "No time limit"
                  : timeExpired
                    ? "Time expired"
                    : formatQuizRemainingTime(remainingSeconds)}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400"
                style={{ boxShadow: "var(--card-compact-shadow)" }}
              >
                <CheckCircle size={14} weight="bold" className="text-emerald-400" aria-hidden="true" />
                <AutosaveStatus status={autosync.status} />
              </span>
            </div>
          </div>
        </header>
        <div className="p-4 sm:p-8 md:p-9">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-(--muted) mb-3 sm:mb-4">
            <span className="rounded-full bg-(--accent)/10 px-2.5 py-0.5 text-[0.7rem] sm:text-xs font-semibold text-(--accent)">
              {question.questionType === "multiple_choice"
                ? "Select all that apply"
                : question.questionType === "true_false"
                  ? "True or false"
                  : "Single choice"}
            </span>
            <span className="text-[0.7rem] sm:text-xs text-(--muted)">
              {question.points} point{question.points === 1 ? "" : "s"}
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl font-bold leading-snug sm:leading-8 tracking-tight text-(--text)">
            {question.prompt}
          </h2>
          <fieldset disabled={timeExpired} className="mt-5 sm:mt-8 grid gap-2.5 sm:gap-3.5">
            <legend className="sr-only">Answer choices</legend>
            {question.options.map((option, index) => {
              const isSelected = selected.includes(option.id);
              const isMultiple = question.questionType === "multiple_choice";
              return (
                <label
                  key={option.id}
                  className={`group flex min-h-12 sm:min-h-14 cursor-pointer items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl border p-3 sm:p-4 transition-all duration-150 active:scale-[0.995] ${
                    isSelected
                      ? "border-2 border-(--accent) bg-[color-mix(in_srgb,var(--accent)_10%,var(--card-surface,var(--surface)))] ring-1 ring-(--accent)/30"
                      : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--card-surface,var(--surface))_95%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] hover:bg-(--hover)"
                  }`}
                  style={{
                    boxShadow: isSelected
                      ? "0 4px 20px color-mix(in srgb, var(--accent) 18%, transparent), var(--card-compact-shadow)"
                      : "var(--card-compact-shadow)",
                  }}
                >
                  <input
                    type={isMultiple ? "checkbox" : "radio"}
                    name={`question-${question.id}`}
                    checked={isSelected}
                    onChange={() => setSelected(option.id)}
                    className="sr-only"
                  />
                  {/* Custom radio/checkbox indicator */}
                  <span
                    className={`size-5 sm:size-5.5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "border-(--accent)"
                        : "border-[color-mix(in_srgb,var(--text)_30%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_50%,transparent)]"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected ? (
                      isMultiple ? (
                        <span className="size-2 sm:size-2.5 rounded-sm bg-(--accent)" />
                      ) : (
                        <span className="size-2.5 sm:size-3 rounded-full bg-(--accent)" />
                      )
                    ) : null}
                  </span>

                  {/* Letter Badge (A, B, C, D...) */}
                  <span
                    className={`flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                      isSelected
                        ? "bg-(--accent)/20 text-(--accent) border border-(--accent)/40"
                        : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] text-(--muted) group-hover:text-(--text)"
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>

                  {/* Option text */}
                  <span
                    className={`text-sm sm:text-base leading-relaxed ${
                      isSelected
                        ? "font-semibold text-(--text)"
                        : "font-normal text-(--text)"
                    }`}
                  >
                    {option.text}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {/* Bottom pagination & action footer matching mockup */}
          <footer className="mt-8 sm:mt-10 flex items-center justify-between gap-3 sm:gap-6 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-5 sm:pt-7">
            <button
              type="button"
              aria-label="Previous question"
              disabled={currentIndex === 0}
              onClick={() => goTo(currentIndex - 1)}
              className="size-10 sm:size-11 shrink-0 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) text-(--text) flex items-center justify-center transition-all hover:border-(--accent) hover:text-(--accent) disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
              style={{ boxShadow: "var(--card-compact-shadow)" }}
            >
              <ArrowLeft size={18} weight="bold" />
            </button>

            <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 px-1 max-w-[12rem] sm:max-w-xs md:max-w-md no-scrollbar">
              {attempt.questions.map((item, index) => {
                const answered =
                  (autosync.value.answers[item.id]?.selectedOptionIds.length ?? 0) >
                  0;
                const isCurrent = index === currentIndex;
                return (
                  <div key={item.id} className="flex flex-col items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Go to question ${index + 1}`}
                      aria-current={isCurrent ? "step" : undefined}
                      onClick={() => goTo(index)}
                      className={`size-9 sm:size-10 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center transition-all cursor-pointer ${
                        isCurrent
                          ? "bg-(--accent) text-(--on-accent,white) shadow-[0_2px_12px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                          : "border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) text-(--text) hover:border-(--accent)/50"
                      }`}
                      style={{
                        boxShadow: isCurrent ? undefined : "var(--card-compact-shadow)",
                      }}
                    >
                      {index + 1}
                    </button>
                    <span
                      className={`size-1.5 rounded-full transition-colors ${
                        isCurrent
                          ? "bg-(--accent)"
                          : answered
                            ? "bg-emerald-500"
                            : "bg-[color-mix(in_srgb,var(--text)_25%,transparent)]"
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                );
              })}
            </div>

            {currentIndex < attempt.questions.length - 1 ? (
              <button
                type="button"
                aria-label="Next question"
                disabled={timeExpired}
                onClick={() => goTo(currentIndex + 1)}
                className="size-10 sm:size-11 shrink-0 rounded-xl bg-(--accent) text-(--on-accent,white) flex items-center justify-center transition-all hover:opacity-95 shadow-[0_2px_12px_color-mix(in_srgb,var(--accent)_35%,transparent)] cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowRight size={18} weight="bold" />
              </button>
            ) : (
              <Button
                disabled={
                  !complete || submit.isPending || isSubmitting || timeExpired
                }
                onClick={requestSubmit}
                className="h-10 sm:h-11 px-4 sm:px-6 rounded-xl font-bold text-xs sm:text-sm shadow-[0_2px_12px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
              >
                {submit.isPending || isSubmitting ? "Submitting…" : "Submit"}
                <CheckCircle size={18} weight="bold" />
              </Button>
            )}
          </footer>

          {timeExpired ? (
            <p
              role="status"
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm text-red-400"
            >
              <WarningCircle size={18} className="mt-0.5 shrink-0" />
              The server timer has expired. Your saved answers remain in this
              browser, but this attempt can no longer accept changes.
            </p>
          ) : null}
          {submit.error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm text-red-400"
            >
              {submit.error.message}
            </p>
          ) : null}
        </div>
      </div>
      {showSubmitConfirmation ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-quiz-title"
            className="w-full max-w-md rounded-[16px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-6 text-(--text)"
            style={{ boxShadow: "var(--card-shadow), 0 25px 50px -12px rgba(0, 0, 0, 0.4)" }}
          >
            <div className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-(--accent)/12 text-(--accent)">
              <CheckCircle size={22} weight="bold" />
            </div>
            <h2 id="submit-quiz-title" className="mt-3 sm:mt-4 text-lg sm:text-xl font-bold">
              Submit quiz?
            </h2>
            <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm leading-relaxed text-(--muted)">
              You have answered {answeredQuestionCount(attempt, autosync.value)}{" "}
              of {attempt.questions.length} questions. Your latest answers will
              be synced before the server grades this attempt.
            </p>
            <div className="mt-5 sm:mt-6 flex justify-end gap-2">
              <Button
                motion="static"
                onClick={() => setShowSubmitConfirmation(false)}
                className="h-9 sm:h-10 text-xs sm:text-sm rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) text-(--text) shadow-none hover:bg-(--hover)"
              >
                Keep working
              </Button>
              <Button
                onClick={() => {
                  setShowSubmitConfirmation(false);
                  void handleSubmit();
                }}
                className="h-9 sm:h-10 text-xs sm:text-sm"
              >
                Submit quiz
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QuizResultCard({
  result,
  onContinueCourse,
  onRetry,
}: {
  result: QuizResult;
  onContinueCourse?: () => void;
  onRetry?: () => void;
}) {
  return (
    <section
      className="mx-auto max-w-2xl rounded-[14px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 sm:p-8 text-(--text)"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <p className="text-[0.68rem] sm:text-xs font-bold uppercase tracking-[0.18em] text-(--accent)">
        Quiz completed
      </p>
      <h1 className="mt-1 sm:mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-(--text)">
        {result.percentage.toFixed(0)}%
      </h1>
      <p
        className={`mt-1.5 sm:mt-2 text-xs sm:text-sm font-bold uppercase tracking-wider ${result.passed ? "text-emerald-500" : "text-red-500"}`}
      >
        {result.passed ? "PASSED" : "TRY AGAIN"}
      </p>
      <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-2.5 sm:gap-3 text-sm">
        <div
          className="rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) p-2.5 sm:p-4"
          style={{ boxShadow: "var(--card-compact-shadow)" }}
        >
          <span className="block text-[0.68rem] sm:text-xs font-semibold text-(--muted)">Score</span>
          <strong className="text-base sm:text-lg font-bold text-(--text)">
            {result.score} / {result.maxScore}
          </strong>
        </div>
        <div
          className="rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) p-2.5 sm:p-4"
          style={{ boxShadow: "var(--card-compact-shadow)" }}
        >
          <span className="block text-[0.68rem] sm:text-xs font-semibold text-(--muted)">Attempt</span>
          <strong className="text-base sm:text-lg font-bold text-(--text)">#{result.attemptNumber}</strong>
        </div>
      </div>
      <div className="mt-5 sm:mt-6 flex flex-wrap gap-2.5">
        {onRetry ? (
          <Button onClick={onRetry} className="h-9 sm:h-10 text-xs sm:text-sm">Try another attempt</Button>
        ) : null}
        {onContinueCourse ? (
          <Button
            className="h-9 sm:h-10 text-xs sm:text-sm rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) text-(--text) shadow-none hover:bg-(--hover)"
            onClick={onContinueCourse}
          >
            Continue Course
          </Button>
        ) : null}
      </div>
      {result.feedbackMode !== "never" && result.answers?.length ? (
        <div className="mt-5 sm:mt-7 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4 sm:pt-6">
          <h2 className="text-base sm:text-lg font-bold text-(--text)">Answer review</h2>
          <ol className="mt-3 sm:mt-4 grid gap-2.5 sm:gap-3.5">
            {result.answers.map((answer, index) => (
              <li
                key={answer.questionId}
                className="rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-2.5 sm:p-4.5"
                style={{ boxShadow: "var(--card-compact-shadow)" }}
              >
                <p className="font-semibold text-(--text)">
                  {index + 1}. {answer.prompt}
                </p>
                <p
                  className={`mt-2 text-xs font-bold uppercase tracking-wider ${answer.isCorrect ? "text-emerald-500" : "text-red-500"}`}
                >
                  {answer.isCorrect ? "Correct" : "Incorrect"} —{" "}
                  {answer.pointsAwarded} point(s)
                </p>
                <p className="mt-2 text-sm text-(--muted)">
                  <span className="font-semibold text-(--text)">Your answer:</span>{" "}
                  {answer.selectedOptionTexts.join(", ") || "No answer"}
                </p>
                {!answer.isCorrect ? (
                  <p className="mt-1 text-sm text-(--muted)">
                    <span className="font-semibold text-(--text)">Correct answer:</span>{" "}
                    {answer.correctOptionTexts.join(", ")}
                  </p>
                ) : null}
                {answer.explanation ? (
                  <p className="mt-2 text-sm text-(--muted) italic">
                    {answer.explanation}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
