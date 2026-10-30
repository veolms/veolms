import { ProgressRing } from "../../components/ProgressRing";
import type { QuizTone } from "./QuizStage";

const RING_STROKE: Record<QuizTone, string> = {
  neutral: "stroke-(--accent)",
  positive: "stroke-(--quiz-positive)",
  negative: "stroke-(--quiz-negative)",
  caution: "stroke-(--quiz-caution)",
};

/** A score out of 100 as a ring, with the figure in its centre. */
export function QuizScoreRing({
  percentage,
  tone = "neutral",
  caption,
}: {
  /** Null when there is no graded score to show yet. */
  percentage: number | null;
  tone?: QuizTone;
  caption?: string;
}) {
  // A score above 100% (an attempt imported with the score another platform
  // recorded) fills the ring; the figure in the centre stays the real one.
  const share =
    percentage === null ? 0 : Math.max(0, Math.min(100, percentage)) / 100;

  return (
    <div
      className="relative size-30 shrink-0 sm:size-34"
      role="img"
      aria-label={
        percentage === null
          ? "No score yet"
          : `${caption ?? "Score"}: ${percentage.toFixed(0)} percent`
      }
    >
      <ProgressRing
        share={share}
        stroke={4.4}
        arcClassName={RING_STROKE[tone]}
        className="size-full"
      />
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-[1.75rem] leading-none font-bold tracking-tight text-(--text) tabular-nums sm:text-[2rem]">
          {percentage === null ? "—" : `${percentage.toFixed(0)}%`}
        </span>
        {caption ? (
          <span className="mt-1 text-[0.6875rem] font-semibold tracking-wide text-(--muted) uppercase">
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}
