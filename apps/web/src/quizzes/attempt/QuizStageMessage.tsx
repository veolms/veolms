import type { ReactNode } from "react";
import { QuizStage, QuizStageBar, QuizStageBody } from "./QuizStage";

interface QuizStageMessageProps {
  lessonBadge?: string;
  onBackToVideo?: () => void;
  /** Sits above the title: a spinner, an icon. */
  visual?: ReactNode;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  role?: "status" | "alert";
  label?: string;
}

/**
 * The stage with one thing to say: the quiz is loading, it could not be
 * opened, it is not assigned. Centred in the same space the questions use,
 * so opening the quiz does not start as a small box and then grow.
 */
export function QuizStageMessage({
  lessonBadge,
  onBackToVideo,
  visual,
  title,
  children,
  actions,
  role,
  label,
}: QuizStageMessageProps) {
  return (
    <QuizStage>
      <QuizStageBar onBackToVideo={onBackToVideo} context={lessonBadge} />
      <QuizStageBody
        width="narrow"
        className="items-center justify-center py-10 text-center sm:py-12"
      >
        <div
          role={role}
          aria-label={label}
          className="grid justify-items-center"
        >
          {visual}
          {title ? (
            <h2
              className={`text-base font-bold text-(--text) sm:text-lg ${visual ? "mt-4" : ""}`}
            >
              {title}
            </h2>
          ) : null}
          {children ? (
            <div
              className={`max-w-md text-sm leading-relaxed text-(--text-secondary) ${title ? "mt-1.5" : visual ? "mt-4" : ""}`}
            >
              {children}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            {actions}
          </div>
        ) : null}
      </QuizStageBody>
    </QuizStage>
  );
}
