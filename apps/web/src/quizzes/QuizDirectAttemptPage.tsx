import { useEffect } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { useMyQuizAssignments } from "../services/quizzes";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";

interface Props {
  assignmentId?: string;
  onNavigatePage?: (destination: string) => void;
}

export function QuizDirectAttemptPage({ assignmentId, onNavigatePage }: Props) {
  const assignments = useMyQuizAssignments({ enabled: Boolean(assignmentId) });
  const assignment = assignments.data?.assignments.find((item) => item.id === assignmentId);

  useEffect(() => {
    if (assignment && onNavigatePage) {
      onNavigatePage(
        `/learn/${encodeURIComponent(assignment.courseId)}?lessonId=${encodeURIComponent(assignment.lessonId)}&view=quiz`,
      );
    }
  }, [assignment, onNavigatePage]);

  if (!assignmentId || assignments.isLoading) {
    return (
      <main data-quiz-surface="" className="mx-auto w-full max-w-[1800px]">
        <section
          className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 text-sm text-(--muted) sm:rounded-[24px] sm:p-7"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <CenteredLoadingSpinner label="Redirecting to lesson quiz" className="min-h-32 w-full" />
        </section>
      </main>
    );
  }

  if (!assignment) {
    return (
      <main data-quiz-surface="" className="mx-auto w-full max-w-[1800px]">
        <section
          className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 text-(--text) sm:rounded-[24px] sm:p-7"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <p className="text-lg font-bold">Assessment unavailable</p>
          <p className="mt-2 text-sm text-(--muted)">
            This quiz may have been removed, restricted, or is not assigned to your account.
          </p>
          <button
            type="button"
            onClick={() => onNavigatePage?.("/quizzes")}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) px-3.5 py-1.5 text-xs font-semibold text-(--accent) transition-all hover:border-(--accent)/30 sm:mt-5 sm:px-4 sm:py-2 sm:text-sm"
            style={{ boxShadow: "var(--card-compact-shadow)" }}
          >
            <ArrowLeft size={16} weight="bold" /> Back to quizzes
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      data-quiz-surface=""
      className="mx-auto grid w-full max-w-6xl gap-2.5 px-0 py-0.5 sm:gap-4 sm:p-8"
    >
      <section
        className="rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 text-sm text-(--muted) sm:rounded-[24px] sm:p-7"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <p className="text-sm font-medium">Opening lesson assessment…</p>
        <button
          type="button"
          onClick={() =>
            onNavigatePage?.(
              `/learn/${encodeURIComponent(assignment.courseId)}?lessonId=${encodeURIComponent(assignment.lessonId)}&view=quiz`,
            )
          }
          className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) px-3.5 py-1.5 text-xs font-semibold text-(--accent) transition-all hover:border-(--accent)/30 sm:text-sm"
        >
          Go to lesson quiz
        </button>
      </section>
    </main>
  );
}
