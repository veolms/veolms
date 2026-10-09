import type { ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";

/**
 * The lesson quiz, drawn straight onto the lesson card.
 *
 * The quiz takes the place of the video, and the video has no frame of its
 * own: it runs to the card's edges. The quiz used to bring a second card
 * with a border, a header band and a shadow, which left a card inside a card
 * and a quarter of the width spent on padding. The stage has no surface: a
 * slim bar across the top, the content in a readable column, and one
 * hairline where it meets the lesson title below.
 */

/**
 * Status colours that hold up on every palette in both modes. The palettes
 * define `--success` and `--danger` for dark surfaces; mixed half-and-half
 * with the text colour they move toward whichever end is readable.
 */
const STAGE_TONES =
  "[--quiz-positive:color-mix(in_srgb,var(--success,#22c55e)_50%,var(--text))] [--quiz-negative:color-mix(in_srgb,var(--danger,#f43f5e)_68%,var(--text))] [--quiz-caution:color-mix(in_srgb,#f59e0b_50%,var(--text))]";

/** The line the stage and everything on it draws its edges with. */
export const QUIZ_HAIRLINE =
  "border-[color-mix(in_srgb,var(--text)_9%,transparent)]";

/** Side padding shared by the bar, the rail and the content column. */
export const QUIZ_GUTTER = "px-3.5 sm:px-6 lg:px-8";

/** A raised surface for things that are pressed or read as a unit. */
export const QUIZ_RAISED_SURFACE =
  "bg-(--card-surface-raised,var(--surface-strong)) ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_7%,transparent)]";

export const QUIZ_EYEBROW =
  "text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-(--accent-ink,var(--accent))";

export type QuizTone = "neutral" | "positive" | "negative" | "caution";

const TONE_TEXT: Record<QuizTone, string> = {
  neutral: "text-(--text-secondary)",
  positive: "text-(--quiz-positive)",
  negative: "text-(--quiz-negative)",
  caution: "text-(--quiz-caution)",
};

const TONE_SURFACE: Record<QuizTone, string> = {
  neutral: "bg-[color-mix(in_srgb,var(--text)_7%,transparent)]",
  positive: "bg-[color-mix(in_srgb,var(--quiz-positive)_13%,transparent)]",
  negative: "bg-[color-mix(in_srgb,var(--quiz-negative)_13%,transparent)]",
  caution: "bg-[color-mix(in_srgb,var(--quiz-caution)_14%,transparent)]",
};

export function quizToneText(tone: QuizTone) {
  return TONE_TEXT[tone];
}

export function quizToneSurface(tone: QuizTone) {
  return TONE_SURFACE[tone];
}

interface QuizStageProps {
  children: ReactNode;
  /**
   * Keeps the stage at least as tall as a short video, so it does not
   * collapse to a strip while loading or jump between a two-option and a
   * five-option question.
   */
  fill?: boolean;
  label?: string;
}

export function QuizStage({
  children,
  fill = true,
  label = "Lesson quiz",
}: QuizStageProps) {
  return (
    <section
      data-quiz-surface=""
      data-quiz-stage=""
      aria-label={label}
      className={`relative flex w-full min-w-0 flex-col border-b ${QUIZ_HAIRLINE} text-(--text) ${STAGE_TONES} ${fill ? "sm:min-h-120 lg:min-h-128" : ""}`}
    >
      {children}
    </section>
  );
}

interface QuizStageBarProps {
  onBackToVideo?: () => void;
  /** Where the learner is: "Lesson 6 Quiz". */
  context?: string;
  /** A quieter second part of the context: "Attempt 1 of 3". */
  detail?: string;
  /** Live status on the right: the timer, whether answers are saved. */
  children?: ReactNode;
}

export function QuizStageBar({
  onBackToVideo,
  context,
  detail,
  children,
}: QuizStageBarProps) {
  if (!onBackToVideo && !context && !detail && !children) return null;

  return (
    <header
      className={`flex min-h-13 items-center gap-2 sm:gap-3 ${QUIZ_GUTTER}`}
    >
      {onBackToVideo ? (
        <button
          type="button"
          onClick={onBackToVideo}
          // Pulled left by its own padding so the arrow, not the hover
          // area, lines up with the content below.
          className="-ml-2 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem]! font-semibold! text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) active:scale-[0.98]"
        >
          <ArrowLeft size={15} weight="bold" aria-hidden="true" />
          <span>Back to video</span>
        </button>
      ) : null}

      {context || detail ? (
        // Below 480px the bar has room for the way back and the live
        // status only; both matter more mid-attempt than the lesson name.
        <p className="hidden min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium text-(--muted) min-[480px]:flex">
          {onBackToVideo ? (
            <span
              aria-hidden="true"
              className={`mr-1.5 h-4 border-l ${QUIZ_HAIRLINE}`}
            />
          ) : null}
          <Exam
            size={15}
            weight="bold"
            aria-hidden="true"
            className="shrink-0 text-(--accent-ink,var(--accent))"
          />
          {context ? (
            <span className="truncate font-semibold text-(--text-secondary)">
              {context}
            </span>
          ) : null}
          {context && detail ? <span aria-hidden="true">·</span> : null}
          {detail ? <span className="shrink-0">{detail}</span> : null}
        </p>
      ) : null}

      {children ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {children}
        </div>
      ) : null}
    </header>
  );
}

/** The readable column every stage view sets its content in. */
export function QuizStageBody({
  children,
  width = "reading",
  className = "",
}: {
  children: ReactNode;
  width?: "reading" | "narrow";
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex w-full min-w-0 flex-1 flex-col ${QUIZ_GUTTER} ${width === "narrow" ? "max-w-2xl" : "max-w-3xl"} ${className}`}
    >
      {children}
    </div>
  );
}

/** A small pill of live status in the stage bar. */
export function QuizStatusChip({
  tone = "neutral",
  icon,
  children,
  label,
}: {
  tone?: QuizTone;
  icon: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold tabular-nums ${quizToneSurface(tone)} ${quizToneText(tone)}`}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </div>
  );
}

/** A notice inside the stage: time is up, a submit failed. */
export function QuizNotice({
  tone,
  icon,
  role = "status",
  children,
}: {
  tone: Exclude<QuizTone, "neutral">;
  icon?: ReactNode;
  role?: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <p
      role={role}
      className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[0.8125rem] leading-relaxed font-medium ${quizToneSurface(tone)} ${quizToneText(tone)}`}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** One labelled figure: "Best score — 80%". */
export function QuizStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`min-w-0 rounded-xl px-3.5 py-3 ${QUIZ_RAISED_SURFACE}`}>
      <dt className="text-[0.6875rem] font-semibold tracking-wide text-(--muted) uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-lg leading-none font-bold text-(--text) tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** The quieter of two actions on a stage view. */
export const QUIZ_SECONDARY_ACTION =
  "h-11 rounded-xl bg-(--card-surface-raised,var(--surface-strong)) px-4 text-sm! font-semibold! text-(--text) shadow-none ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_9%,transparent)] hover:bg-(--card-surface-hover,var(--hover)) hover:shadow-none";

export const QUIZ_PRIMARY_ACTION =
  "h-11 rounded-xl px-5 text-[0.9375rem]! font-semibold!";
