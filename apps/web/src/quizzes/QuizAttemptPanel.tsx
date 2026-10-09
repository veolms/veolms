import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { QuizResult } from "@veolms/contracts";
import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { getApiError } from "../lib/api-error";
import {
  AutosaveStatus,
  isAutosaveUnsaved,
  useAutosync,
} from "../lib/autosync";
import {
  useMyQuizAssignments,
  useQuizAttempt,
  useQuizPricingPreview,
  useQuizResult,
} from "../services/quizzes/quizzes.queries";
import { quizzesService } from "../services/quizzes/quizzes.service";
import {
  useStartQuizAttempt,
  useSubmitQuizAttempt,
} from "../services/quizzes/quizzes.mutations";
import { QuizAttemptFooter } from "./attempt/QuizAttemptFooter";
import { QuizPreviousAttemptsView } from "./attempt/QuizPreviousAttemptsView";
import { QuizProgressRail } from "./attempt/QuizProgressRail";
import { QuizQuestionView } from "./attempt/QuizQuestionView";
import { QuizResultView } from "./attempt/QuizResultView";
import {
  QUIZ_SECONDARY_ACTION,
  QuizNotice,
  QuizStage,
  QuizStageBar,
  QuizStageBody,
  QuizStatusChip,
} from "./attempt/QuizStage";
import { QuizStageMessage } from "./attempt/QuizStageMessage";
import { QuizSubmitDialog } from "./attempt/QuizSubmitDialog";
import {
  answeredQuestionCount,
  formatQuizRemainingTime,
  hasAnsweredEveryQuestion,
  isQuestionAnswered,
  serverClockOffsetMs,
  toBulkQuizAnswers,
  type QuizAttemptDraft,
} from "./quizDraft";
import { QuizEnrollmentCard } from "./QuizEnrollmentCard";

/** The lesson page shows this while the quiz assignment itself is loading. */
export { QuizStageMessage };

interface QuizAttemptPanelProps {
  assignmentId: string;
  courseId?: string;
  quizTitle?: string;
  activeAttemptId?: string | null;
  maxAttempts?: number;
  /** Attempts the student has already made on this assignment. */
  attemptCount?: number;
  /** Best graded score so far, as a percentage. */
  bestScore?: number | null;
  latestPassed?: boolean | null;
  onContinueCourse?: () => void;
  onBackToVideo?: () => void;
  onPassed?: (result: QuizResult) => void;
  lessonBadge?: string;
}

export function QuizAttemptPanel({
  assignmentId,
  courseId,
  quizTitle,
  activeAttemptId = null,
  maxAttempts = 1,
  attemptCount = 0,
  bestScore = null,
  latestPassed = null,
  onContinueCourse,
  onBackToVideo,
  onPassed,
  lessonBadge,
}: QuizAttemptPanelProps) {
  const [attemptId, setAttemptId] = useState(activeAttemptId);
  const [result, setResult] = useState<QuizResult | null>(null);
  // A first attempt starts as the quiz opens. Once the student has attempted
  // it, opening the quiz again only shows where they stand: starting another
  // attempt (and its timer) takes an explicit click.
  const [startConfirmed, setStartConfirmed] = useState(false);
  // The quiz was republished while this learner had it open, and their
  // attempt restarted on the new questions.
  const [restartedForUpdate, setRestartedForUpdate] = useState(false);
  const awaitingStartConfirmation = attemptCount > 0 && !startConfirmed;
  const prevAssignmentIdRef = useRef(assignmentId);
  const startRequestedForAssignmentRef = useRef<string | null>(null);
  // An attempt whose result the student has moved on from. The parent's
  // `activeAttemptId` can still name it for a moment afterwards.
  const dismissedAttemptIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevAssignmentIdRef.current !== assignmentId) {
      prevAssignmentIdRef.current = assignmentId;
      startRequestedForAssignmentRef.current = null;
      dismissedAttemptIdRef.current = null;
      setAttemptId(activeAttemptId);
      setResult(null);
      setStartConfirmed(false);
      setRestartedForUpdate(false);
      return;
    }
    if (
      !attemptId &&
      activeAttemptId &&
      !result &&
      activeAttemptId !== dismissedAttemptIdRef.current
    ) {
      setAttemptId(activeAttemptId);
    }
  }, [assignmentId, activeAttemptId, attemptId, result]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const expiryRefreshRef = useRef<string | null>(null);
  const start = useStartQuizAttempt();
  const {
    error: startError,
    isPending: isStarting,
    mutate: startAttempt,
    reset: resetStart,
  } = start;
  const submit = useSubmitQuizAttempt();
  const attemptQuery = useQuizAttempt(attemptId);
  const attempt = attemptQuery.data;
  // The server has closed this attempt — time ran out, or it was handed in
  // from another tab. Its result is shown instead of a dead-end error.
  const attemptErrorCode = attemptQuery.error
    ? getApiError(attemptQuery.error).code
    : null;
  const attemptClosed =
    Boolean(attemptId) &&
    !result &&
    (attemptErrorCode === "ATTEMPT_EXPIRED" ||
      attemptErrorCode === "ATTEMPT_NOT_ACTIVE" ||
      (attempt !== undefined && attempt.status !== "in_progress"));
  const closedResultQuery = useQuizResult(attemptClosed ? attemptId : null);
  const shownResult =
    result ?? (attemptClosed ? (closedResultQuery.data ?? null) : null);

  // An attempt the server graded by itself (time ran out with a passing
  // score) never went through the submit below, so report the pass here.
  const closedResult = attemptClosed ? closedResultQuery.data : undefined;
  const reportedPassRef = useRef<string | null>(null);
  useEffect(() => {
    if (!closedResult?.passed) return;
    if (reportedPassRef.current === closedResult.attemptId) return;
    reportedPassRef.current = closedResult.attemptId;
    onPassed?.(closedResult);
  }, [closedResult, onPassed]);
  const myQuizAssignmentsQuery = useMyQuizAssignments({
    enabled: !courseId,
  });
  const resolvedCourseId =
    courseId ||
    myQuizAssignmentsQuery.data?.assignments.find((a) => a.id === assignmentId)
      ?.courseId ||
    "";
  const resolvedQuizTitle =
    quizTitle ||
    myQuizAssignmentsQuery.data?.assignments.find((a) => a.id === assignmentId)
      ?.quizTitle ||
    "Lesson Quiz";

  const pricingPreviewQuery = useQuizPricingPreview(
    resolvedCourseId || null,
    assignmentId,
    {
      enabled: Boolean(resolvedCourseId && !attemptId && !result),
    },
  );
  const preview = pricingPreviewQuery.data;

  const initialValue = useMemo<QuizAttemptDraft>(
    () => ({
      answers: attempt?.answers ?? {},
      currentQuestionId: attempt?.questions[0]?.id ?? null,
    }),
    [attempt?.answers, attempt?.questions],
  );
  const autosync = useAutosync<QuizAttemptDraft, { saved: true }>({
    key: {
      entity: "quiz-attempt",
      entityId: attemptId ?? "pending",
      scope: "answers",
    },
    initialValue,
    enabled: Boolean(attempt),
    // Partial drafts are saved too. Saving only a complete draft meant a
    // student who ran out of time one question short had nothing recorded.
    validate: () =>
      attempt ? true : { valid: false, message: "Quiz is still loading." },
    sync: (draft) =>
      quizzesService
        .saveAnswers(attempt!.id, toBulkQuizAnswers(draft))
        .catch((error: unknown) => {
          // The attempt is gone: see the restart below. Asking for it again
          // is what notices.
          if (getApiError(error).code === "ATTEMPT_NOT_FOUND") {
            void attemptQuery.refetch();
          }
          throw error;
        }),
  });
  const answersUnsaved = isAutosaveUnsaved(autosync.status);
  const autosyncValue = autosync.value;
  const autosyncIsRestoring = autosync.isRestoring;
  const flushAutosync = autosync.flush;
  const discardAutosync = autosync.discard;

  useEffect(() => {
    if (
      attemptId ||
      isStarting ||
      result ||
      awaitingStartConfirmation ||
      startRequestedForAssignmentRef.current === assignmentId
    )
      return;

    // A paid quiz the student has not bought: show the purchase card instead.
    if (preview && !preview.isEnrolled) {
      return;
    }

    startRequestedForAssignmentRef.current = assignmentId;
    startAttempt(assignmentId, { onSuccess: (next) => setAttemptId(next.id) });
  }, [
    assignmentId,
    attemptId,
    awaitingStartConfirmation,
    isStarting,
    preview,
    result,
    startAttempt,
  ]);

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

  // An open attempt is removed when the author publishes new questions for
  // the quiz: the learner restarts on those, without using up an attempt.
  // The page that still had the old attempt open finds it gone and starts
  // again here, instead of stopping at "Unable to open this quiz".
  const attemptGone =
    Boolean(attemptId) && !result && attemptErrorCode === "ATTEMPT_NOT_FOUND";
  useEffect(() => {
    if (!attemptGone) return;
    dismissedAttemptIdRef.current = attemptId;
    startRequestedForAssignmentRef.current = null;
    expiryRefreshRef.current = null;
    discardAutosync();
    resetStart();
    setRestartedForUpdate(true);
    // The count of attempts the page was given still includes the one that
    // is gone; without this it would stop to ask before starting.
    setStartConfirmed(true);
    setAttemptId(null);
  }, [attemptGone, attemptId, discardAutosync, resetStart]);
  useEffect(() => {
    if (!attempt?.expiresAt) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [attempt?.expiresAt]);

  // Counted against the server's clock: a device clock that is a few
  // minutes off used to end the quiz early or show time that was not there.
  const clockOffsetMs = serverClockOffsetMs(
    attempt?.serverNow,
    attemptQuery.dataUpdatedAt,
  );
  const expiresAtMs = attempt?.expiresAt ? Date.parse(attempt.expiresAt) : null;
  const remainingSeconds =
    expiresAtMs === null
      ? null
      : Math.max(0, Math.ceil((expiresAtMs - (now + clockOffsetMs)) / 1_000));
  const timeExpired = remainingSeconds === 0;

  const submitAttempt = submit.mutateAsync;
  useEffect(() => {
    if (
      !attempt ||
      !timeExpired ||
      attempt.status !== "in_progress" ||
      expiryRefreshRef.current === attempt.id
    )
      return;
    expiryRefreshRef.current = attempt.id;
    // Time is up: save what is there and hand the attempt in. The server
    // grades whatever was saved, so the answers given so far still count.
    setShowSubmitConfirmation(false);
    setIsSubmitting(true);
    void (async () => {
      try {
        await flushAutosync().catch(() => undefined);
        const next = await submitAttempt(attempt.id);
        setResult(next);
        discardAutosync();
        if (next.passed) onPassed?.(next);
      } catch {
        // Not reachable right now. Reloading the attempt shows its result
        // once the server has closed it.
        void refetchAttempt();
      } finally {
        setIsSubmitting(false);
      }
    })();
  }, [
    attempt,
    discardAutosync,
    flushAutosync,
    onPassed,
    refetchAttempt,
    submitAttempt,
    timeExpired,
  ]);

  const retry = () => {
    if (!shownResult || shownResult.attemptNumber >= maxAttempts) return;
    autosync.discard();
    dismissedAttemptIdRef.current = shownResult.attemptId;
    expiryRefreshRef.current = null;
    startRequestedForAssignmentRef.current = null;
    resetStart();
    setStartConfirmed(true);
    setResult(null);
    setAttemptId(null);
  };

  if (shownResult) {
    return (
      <QuizResultView
        result={shownResult}
        maxAttempts={maxAttempts}
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        onContinueCourse={onContinueCourse}
        onRetry={shownResult.attemptNumber < maxAttempts ? retry : undefined}
      />
    );
  }

  const apiError = startError ? getApiError(startError) : null;
  // A paid quiz the student has not bought yet. The server also reports this as
  // QUIZ_ENROLLMENT_REQUIRED if the attempt is started anyway.
  const isEnrollmentRequired = Boolean(
    !attemptId &&
    !isStarting &&
    ((preview && !preview.isEnrolled) ||
      apiError?.code === "QUIZ_ENROLLMENT_REQUIRED"),
  );

  if (isEnrollmentRequired && resolvedCourseId && !attemptId && !isStarting) {
    return (
      <QuizEnrollmentCard
        courseId={resolvedCourseId}
        assignmentId={assignmentId}
        quizTitle={resolvedQuizTitle}
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        onEnrolled={() => {
          resetStart();
          startRequestedForAssignmentRef.current = null;
          void pricingPreviewQuery.refetch();
          startAttempt(assignmentId, {
            onSuccess: (next) => setAttemptId(next.id),
          });
        }}
      />
    );
  }

  if (!attemptId && !isStarting && !startError && awaitingStartConfirmation) {
    return (
      <QuizPreviousAttemptsView
        quizTitle={resolvedQuizTitle}
        attemptCount={attemptCount}
        maxAttempts={maxAttempts}
        bestScore={bestScore}
        latestPassed={latestPassed}
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        onContinueCourse={onContinueCourse}
        onStart={
          attemptCount < maxAttempts ? () => setStartConfirmed(true) : undefined
        }
      />
    );
  }

  // For a closed attempt the only thing left to load is its result.
  const openingError =
    startError ??
    (attemptClosed ? closedResultQuery.error : attemptQuery.error);
  // A removed attempt is not an error to show: the quiz is restarting.
  if (openingError && !attemptGone) {
    const retryOpening = () => {
      if (startError) {
        resetStart();
        startRequestedForAssignmentRef.current = null;
      } else if (attemptClosed) {
        void closedResultQuery.refetch();
      } else {
        void attemptQuery.refetch();
      }
    };
    return (
      <QuizStageMessage
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        role="alert"
        visual={
          <span className="grid size-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--quiz-negative)_13%,transparent)] text-(--quiz-negative)">
            <WarningCircle size={26} weight="duotone" aria-hidden="true" />
          </span>
        }
        title="Unable to open this quiz"
        actions={
          <Button
            motion="static"
            onClick={retryOpening}
            className={QUIZ_SECONDARY_ACTION}
          >
            Try again
          </Button>
        }
      >
        {openingError.message}
      </QuizStageMessage>
    );
  }
  if (
    attemptQuery.isLoading ||
    isStarting ||
    !attempt ||
    attemptClosed ||
    attemptGone
  ) {
    return (
      <QuizStageMessage
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        role="status"
        label="Loading quiz"
        visual={
          <span className="text-(--muted)">
            <LoadingSpinnerIcon size={26} />
          </span>
        }
      />
    );
  }
  if (attempt.status !== "in_progress") {
    return (
      <QuizStageMessage
        lessonBadge={lessonBadge}
        onBackToVideo={onBackToVideo}
        title="This attempt is no longer active"
      >
        Go back to the video, then open the quiz again to see where you stand.
      </QuizStageMessage>
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
  const answered = attempt.questions.map((item) =>
    isQuestionAnswered(item, autosync.value),
  );
  const firstUnanswered = answered.indexOf(false);
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
  const setTextResponse = (value: string) =>
    autosync.update((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [question.id]: { selectedOptionIds: [], textResponse: value },
      },
    }));
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
      // If the attempt was removed meanwhile, this is what finds out.
      void attemptQuery.refetch();
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestSubmit = () => {
    if (!complete || timeExpired || isSubmitting || submit.isPending) return;
    setShowSubmitConfirmation(true);
  };

  return (
    <QuizStage
      label={`${resolvedQuizTitle}, question ${currentIndex + 1} of ${attempt.questions.length}`}
    >
      <QuizStageBar
        onBackToVideo={onBackToVideo}
        context={lessonBadge ?? resolvedQuizTitle}
        // Said once. It used to sit in two badges side by side.
        detail={`Attempt ${attempt.attemptNumber}${maxAttempts > 1 ? ` of ${maxAttempts}` : ""}`}
      >
        {/* A quiz without a time limit shows no clock: a pill that only
            ever said "No time limit" was not telling the learner anything
            they could act on. */}
        {remainingSeconds === null ? null : (
          <QuizStatusChip
            tone={
              timeExpired
                ? "negative"
                : remainingSeconds <= 60
                  ? "caution"
                  : "neutral"
            }
            icon={<Clock size={14} weight="bold" aria-hidden="true" />}
          >
            {/* A timer, not a live region: announcing every second would
                talk over the question. */}
            <span role="timer" aria-label="Time remaining">
              {timeExpired
                ? "Time expired"
                : formatQuizRemainingTime(remainingSeconds)}
            </span>
          </QuizStatusChip>
        )}
        <QuizStatusChip
          tone={answersUnsaved ? "caution" : "neutral"}
          icon={
            answersUnsaved ? (
              <WarningCircle size={14} weight="bold" aria-hidden="true" />
            ) : (
              <CheckCircle
                size={14}
                weight="fill"
                aria-hidden="true"
                className="text-(--quiz-positive)"
              />
            )
          }
        >
          <span className="max-w-32 sm:max-w-56 [&>p]:truncate">
            <AutosaveStatus status={autosync.status} />
          </span>
        </QuizStatusChip>
      </QuizStageBar>

      <QuizProgressRail
        answered={answered}
        currentIndex={currentIndex}
        onSelect={goTo}
        disabled={timeExpired}
      />

      <QuizStageBody className="pt-4 pb-5 sm:pt-7 sm:pb-7">
        <QuizQuestionView
          question={question}
          index={currentIndex}
          total={attempt.questions.length}
          selectedOptionIds={selected}
          textResponse={autosync.value.answers[question.id]?.textResponse ?? ""}
          disabled={timeExpired}
          onToggleOption={setSelected}
          onTextChange={setTextResponse}
        />

        {/* Held to the bottom of the stage, so the buttons stay where they
            are from one question to the next whatever its length. */}
        <div className="mt-auto grid gap-3 pt-7 sm:pt-9">
          {restartedForUpdate ? (
            <QuizNotice
              tone="caution"
              icon={
                <WarningCircle size={17} weight="bold" aria-hidden="true" />
              }
            >
              This quiz was updated, so it has restarted with the latest
              questions. It does not count as an extra attempt.
            </QuizNotice>
          ) : null}
          {timeExpired ? (
            <QuizNotice
              tone="negative"
              icon={
                <WarningCircle size={17} weight="bold" aria-hidden="true" />
              }
            >
              Time is up. This attempt can no longer be changed, and the answers
              saved so far are being submitted.
            </QuizNotice>
          ) : null}
          {submit.error ? (
            <QuizNotice
              tone="negative"
              role="alert"
              icon={
                <WarningCircle size={17} weight="bold" aria-hidden="true" />
              }
            >
              {submit.error.message}
            </QuizNotice>
          ) : null}
          <QuizAttemptFooter
            currentIndex={currentIndex}
            total={attempt.questions.length}
            answeredCount={answeredQuestionCount(attempt, autosync.value)}
            firstUnansweredIndex={firstUnanswered < 0 ? null : firstUnanswered}
            locked={timeExpired}
            submitting={submit.isPending || isSubmitting}
            onGoTo={goTo}
            onSubmit={requestSubmit}
          />
        </div>
      </QuizStageBody>

      {showSubmitConfirmation ? (
        <QuizSubmitDialog
          answeredCount={answeredQuestionCount(attempt, autosync.value)}
          total={attempt.questions.length}
          onCancel={() => setShowSubmitConfirmation(false)}
          onConfirm={() => {
            setShowSubmitConfirmation(false);
            void handleSubmit();
          }}
        />
      ) : null}
    </QuizStage>
  );
}
