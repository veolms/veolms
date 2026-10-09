import { useEffect, useRef } from "react";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Button } from "../../components/Button";
import { QUIZ_PRIMARY_ACTION, QUIZ_SECONDARY_ACTION } from "./QuizStage";

interface QuizSubmitDialogProps {
  answeredCount: number;
  total: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function QuizSubmitDialog({
  answeredCount,
  total,
  onCancel,
  onConfirm,
}: QuizSubmitDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  // The quiz re-renders every second while a timer runs, handing this a new
  // `onCancel` each time. Read through a ref, the effect below runs once
  // and does not pull focus back to the button on every tick.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    confirmRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-quiz-title"
        aria-describedby="submit-quiz-description"
        className="w-full max-w-md rounded-[20px] bg-(--card-surface,var(--surface)) p-5 text-(--text) shadow-[var(--surface-frame-edge-shadow),var(--card-floating-shadow)] sm:rounded-3xl sm:p-6"
      >
        <div className="grid size-11 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent))">
          <CheckCircle size={24} weight="duotone" aria-hidden="true" />
        </div>
        <h2
          id="submit-quiz-title"
          className="mt-4 text-xl font-bold tracking-tight"
        >
          Submit your answers?
        </h2>
        <p
          id="submit-quiz-description"
          className="mt-2 text-sm leading-relaxed text-(--text-secondary)"
        >
          You have answered {answeredCount} of {total} question
          {total === 1 ? "" : "s"}. Once submitted, this attempt is graded and
          its answers can no longer be changed.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button
            motion="static"
            onClick={onCancel}
            className={QUIZ_SECONDARY_ACTION}
          >
            Keep working
          </Button>
          <Button
            ref={confirmRef}
            onClick={onConfirm}
            className={QUIZ_PRIMARY_ACTION}
          >
            Submit quiz
          </Button>
        </div>
      </div>
    </div>
  );
}
