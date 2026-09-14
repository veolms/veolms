import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";
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
  onBackToVideo?: () => void;
  onPassed?: (result: QuizResult) => void;
  lessonBadge?: string;
}

export function QuizAttemptPanel({
  assignmentId,
  activeAttemptId = null,
  maxAttempts = 1,
  onContinueCourse,
  onBackToVideo,
  onPassed,
  lessonBadge,
}: QuizAttemptPanelProps) {
  const [attemptId, setAttemptId] = useState(activeAttemptId);
  const [result, setResult] = useState<QuizResult | null>(null);
  const prevAssignmentIdRef = useRef(assignmentId);

  useEffect(() => {
    if (prevAssignmentIdRef.current !== assignmentId) {
      prevAssignmentIdRef.current = assignmentId;
      setAttemptId(activeAttemptId);
      setResult(null);
      return;
    }
    if (!attemptId && activeAttemptId && !result) {
      setAttemptId(activeAttemptId);
    }
  }, [assignmentId, activeAttemptId, attemptId, result]);
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
    if (attemptId || start.isPending || result) return;
    start.mutate(assignmentId, { onSuccess: (next) => setAttemptId(next.id) });
  }, [assignmentId, attemptId, start, result]);

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
        maxAttempts={maxAttempts}
        onBackToVideo={onBackToVideo}
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
        {onBackToVideo || lessonBadge ? (
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            {onBackToVideo ? (
              <button
                type="button"
                onClick={onBackToVideo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted) hover:text-(--text) hover:border-(--accent) transition-all cursor-pointer active:scale-95 shadow-(--card-compact-shadow)"
              >
                <ArrowLeft size={13} weight="bold" />
                <span>Back to video</span>
              </button>
            ) : (
              <span />
            )}
            {lessonBadge ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
                <Exam size={14} className="text-(--accent)" weight="bold" />
                <span>{lessonBadge}</span>
              </div>
            ) : null}
          </div>
        ) : null}
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
        {onBackToVideo || lessonBadge ? (
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            {onBackToVideo ? (
              <button
                type="button"
                onClick={onBackToVideo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted) hover:text-(--text) hover:border-(--accent) transition-all cursor-pointer active:scale-95 shadow-(--card-compact-shadow)"
              >
                <ArrowLeft size={13} weight="bold" />
                <span>Back to video</span>
              </button>
            ) : (
              <span />
            )}
            {lessonBadge ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
                <Exam size={14} className="text-(--accent)" weight="bold" />
                <span>{lessonBadge}</span>
              </div>
            ) : null}
          </div>
        ) : null}
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
        {onBackToVideo || lessonBadge ? (
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
            {onBackToVideo ? (
              <button
                type="button"
                onClick={onBackToVideo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted) hover:text-(--text) hover:border-(--accent) transition-all cursor-pointer active:scale-95 shadow-(--card-compact-shadow)"
              >
                <ArrowLeft size={13} weight="bold" />
                <span>Back to video</span>
              </button>
            ) : (
              <span />
            )}
            {lessonBadge ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
                <Exam size={14} className="text-(--accent)" weight="bold" />
                <span>{lessonBadge}</span>
              </div>
            ) : null}
          </div>
        ) : null}
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
      if (next.passed && onPassed) {
        onPassed(next);
      }
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
    <section data-quiz-surface="" className="mx-auto w-full max-w-4xl text-(--text)">
      <div
        className="overflow-hidden rounded-[16px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) transition-all"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <header className="border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_30%,var(--surface))] p-3.5 sm:p-5">
          {onBackToVideo || lessonBadge ? (
            <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
              {onBackToVideo ? (
                <button
                  type="button"
                  onClick={onBackToVideo}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted) hover:text-(--text) hover:border-(--accent) transition-all cursor-pointer active:scale-95 shadow-(--card-compact-shadow)"
                >
                  <ArrowLeft size={13} weight="bold" />
                  <span>Back to video</span>
                </button>
              ) : (
                <span />
              )}
              {lessonBadge ? (
                <div className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
                  <Exam size={14} className="text-(--accent)" weight="bold" />
                  <span>{lessonBadge}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[0.65rem] sm:text-[0.7rem] font-bold uppercase tracking-[0.14em] text-(--accent)">
                  Assessment
                </p>
                <span className="rounded-md bg-(--accent)/10 px-1.5 py-0.5 text-[0.68rem] font-semibold text-(--accent)">
                  Attempt {attempt.attemptNumber}{maxAttempts > 1 ? ` of ${maxAttempts}` : ""}
                </span>
              </div>
              <h1 className="mt-0.5 text-base sm:text-lg font-semibold tracking-tight text-(--text)">
                Question {currentIndex + 1} of {attempt.questions.length}
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted)"
                style={{ boxShadow: "var(--card-compact-shadow)" }}
              >
                <Exam size={13} weight="bold" className="text-(--accent)" aria-hidden="true" />
                <span>Attempt {attempt.attemptNumber}{maxAttempts > 1 ? ` / ${maxAttempts}` : ""}</span>
              </span>
              <span
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  timeExpired
                    ? "border-red-500/30 bg-red-500/12 text-red-400"
                    : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] text-(--muted)"
                }`}
                style={{ boxShadow: "var(--card-compact-shadow)" }}
              >
                <Clock size={13} weight="bold" aria-hidden="true" />
                {remainingSeconds === null
                  ? "No time limit"
                  : timeExpired
                    ? "Time expired"
                    : formatQuizRemainingTime(remainingSeconds)}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400"
                style={{ boxShadow: "var(--card-compact-shadow)" }}
              >
                <CheckCircle size={13} weight="bold" className="text-emerald-400" aria-hidden="true" />
                <AutosaveStatus status={autosync.status} />
              </span>
            </div>
          </div>
        </header>
        <div className="p-4 sm:p-6 md:p-7">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-(--muted) mb-2.5 sm:mb-3">
            <span className="rounded-md bg-(--accent)/10 px-2 py-0.5 text-[0.68rem] sm:text-xs font-semibold text-(--accent)">
              {question.questionType === "multiple_choice"
                ? "Select all that apply"
                : question.questionType === "true_false"
                  ? "True or false"
                  : question.questionType === "short_answer"
                    ? "Input box (Type your answer)"
                    : "Single choice"}
            </span>
            <span className="text-[0.68rem] sm:text-xs text-(--muted)">
              {question.points} point{question.points === 1 ? "" : "s"}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-medium leading-relaxed tracking-normal text-(--text)">
            {question.prompt}
          </h2>
          {question.questionType === "short_answer" ? (
            <div className="mt-4 sm:mt-6 space-y-2.5">
              <label
                htmlFor={`question-input-${question.id}`}
                className="block text-xs font-medium uppercase tracking-wider text-(--muted)"
              >
                Type your answer below
              </label>
              <div className="relative">
                <input
                  id={`question-input-${question.id}`}
                  type="text"
                  disabled={timeExpired}
                  value={
                    autosync.value.answers[question.id]?.textResponse ?? ""
                  }
                  onChange={(event) => {
                    const val = event.target.value;
                    autosync.update((current) => ({
                      ...current,
                      answers: {
                        ...current.answers,
                        [question.id]: {
                          selectedOptionIds: [],
                          textResponse: val,
                        },
                      },
                    }));
                  }}
                  placeholder="Type your answer here..."
                  autoComplete="off"
                  className="h-11 sm:h-12 w-full rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-4 text-sm font-normal text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20"
                  style={{ boxShadow: "var(--card-compact-shadow)" }}
                />
              </div>
              <p className="text-[0.72rem] sm:text-xs text-(--muted)">
                Grading is case-insensitive. Answer will be checked against accepted responses.
              </p>
            </div>
          ) : (
            <fieldset disabled={timeExpired} className="mt-4 sm:mt-6 grid gap-2 sm:gap-2.5">
              <legend className="sr-only">Answer choices</legend>
              {question.options.map((option, index) => {
                const isSelected = selected.includes(option.id);
                const isMultiple = question.questionType === "multiple_choice";
                return (
                  <label
                    key={option.id}
                    className={`group flex min-h-10 sm:min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all duration-150 active:scale-[0.995] ${
                      isSelected
                        ? "border border-(--accent) bg-[color-mix(in_srgb,var(--accent)_8%,var(--card-surface,var(--surface)))] ring-1 ring-(--accent)/30"
                        : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--card-surface,var(--surface))_95%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] hover:bg-(--hover)"
                    }`}
                    style={{
                      boxShadow: isSelected
                        ? "0 2px 14px color-mix(in srgb, var(--accent) 14%, transparent), var(--card-compact-shadow)"
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
                    {/* Custom indicator: square [] checkbox for multiple choice, circle for single choice */}
                    <span
                      className={`size-4.5 sm:size-5 shrink-0 flex items-center justify-center transition-all ${
                        isMultiple
                          ? `rounded-md border ${
                              isSelected
                                ? "border-(--accent) bg-(--accent) text-(--on-accent,white)"
                                : "border-[color-mix(in_srgb,var(--text)_35%,transparent)] bg-transparent group-hover:border-[color-mix(in_srgb,var(--text)_55%,transparent)]"
                            }`
                          : `rounded-full border-2 ${
                              isSelected
                                ? "border-(--accent)"
                                : "border-[color-mix(in_srgb,var(--text)_30%,transparent)] group-hover:border-[color-mix(in_srgb,var(--text)_50%,transparent)]"
                            }`
                      }`}
                      aria-hidden="true"
                    >
                      {isSelected ? (
                        isMultiple ? (
                          <Check size={12} weight="bold" className="text-(--on-accent,white)" />
                        ) : (
                          <span className="size-2 sm:size-2.5 rounded-full bg-(--accent)" />
                        )
                      ) : null}
                    </span>

                    {/* Letter Badge (A, B, C, D...) */}
                    <span
                      className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                        isSelected
                          ? "bg-(--accent)/20 text-(--accent) border border-(--accent)/40"
                          : "border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] text-(--muted) group-hover:text-(--text)"
                      }`}
                    >
                      {String.fromCharCode(65 + index)}
                    </span>

                    {/* Option text */}
                    <span
                      className={`text-xs sm:text-sm leading-relaxed ${
                        isSelected
                          ? "font-medium text-(--text)"
                          : "font-normal text-(--text)"
                      }`}
                    >
                      {option.text}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {/* Bottom progress bar & navigation footer */}
          <footer className="mt-6 sm:mt-8 flex items-center justify-between gap-3 sm:gap-4 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-4 sm:pt-5">
            <button
              type="button"
              aria-label="Previous question"
              disabled={currentIndex === 0}
              onClick={() => goTo(currentIndex - 1)}
              className="size-9 sm:size-10 shrink-0 rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) text-(--text) flex items-center justify-center transition-all hover:border-(--accent) hover:text-(--accent) disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95"
              style={{ boxShadow: "var(--card-compact-shadow)" }}
            >
              <ArrowLeft size={16} weight="bold" />
            </button>

            {/* Compact Multi-gradient Progress Bar */}
            <div
              className="flex flex-1 max-w-40 sm:max-w-52 flex-col items-center gap-1 px-1"
              role="progressbar"
              aria-valuenow={currentIndex + 1}
              aria-valuemin={1}
              aria-valuemax={attempt.questions.length}
              aria-label={`Progress: Question ${currentIndex + 1} of ${attempt.questions.length}`}
            >
              <span className="text-[0.68rem] sm:text-[0.72rem] font-semibold text-(--muted)">
                {Math.round(((currentIndex + 1) / attempt.questions.length) * 100)}%
              </span>
              <div className="h-1 sm:h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)]">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${((currentIndex + 1) / attempt.questions.length) * 100}%`,
                    background:
                      "linear-gradient(90deg, #f59e0b 0%, var(--accent, #eab308) 50%, #10b981 100%)",
                  }}
                />
              </div>
            </div>

            {currentIndex < attempt.questions.length - 1 ? (
              <button
                type="button"
                aria-label="Next question"
                disabled={timeExpired}
                onClick={() => goTo(currentIndex + 1)}
                className="size-9 sm:size-10 shrink-0 rounded-xl bg-(--accent) text-(--on-accent,white) flex items-center justify-center transition-all hover:opacity-95 shadow-[0_2px_12px_color-mix(in_srgb,var(--accent)_35%,transparent)] cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowRight size={16} weight="bold" />
              </button>
            ) : (
              <Button
                disabled={
                  !complete || submit.isPending || isSubmitting || timeExpired
                }
                onClick={requestSubmit}
                className="h-9 sm:h-10 px-4 sm:px-5 rounded-xl font-semibold text-xs sm:text-sm shadow-[0_2px_12px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
              >
                {submit.isPending || isSubmitting ? "Submitting…" : "Submit"}
                <CheckCircle size={16} weight="bold" />
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
  maxAttempts = 1,
  onBackToVideo,
  onContinueCourse,
  onRetry,
}: {
  result: QuizResult;
  maxAttempts?: number;
  onBackToVideo?: () => void;
  onContinueCourse?: () => void;
  onRetry?: () => void;
}) {
  return (
    <section
      data-quiz-surface=""
      className="mx-auto max-w-2xl rounded-[14px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 sm:p-8 text-(--text)"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {onBackToVideo ? (
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
          <button
            type="button"
            onClick={onBackToVideo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_70%,var(--surface))] px-2.5 py-1 text-xs font-medium text-(--muted) hover:text-(--text) hover:border-(--accent) transition-all cursor-pointer active:scale-95 shadow-(--card-compact-shadow)"
          >
            <ArrowLeft size={13} weight="bold" />
            <span>Back to video</span>
          </button>
        </div>
      ) : null}
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
          <strong className="text-base sm:text-lg font-bold text-(--text)">
            #{result.attemptNumber}{maxAttempts > 1 ? ` of ${maxAttempts}` : ""}
          </strong>
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
                  {answer.textResponse !== undefined && answer.textResponse !== null
                    ? answer.textResponse || "No answer"
                    : answer.selectedOptionTexts?.join(", ") || "No answer"}
                </p>
                {!answer.isCorrect ? (
                  <p className="mt-1 text-sm text-(--muted)">
                    <span className="font-semibold text-(--text)">Correct answer:</span>{" "}
                    {answer.correctOptionTexts?.join(" or ") || "None"}
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
