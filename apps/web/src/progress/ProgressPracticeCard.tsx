import { Link } from "react-router";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { FireIcon as Fire } from "@phosphor-icons/react/Fire";
import { ElevatedCard } from "../components/ElevatedCard";
import { usePracticeStats } from "../services/coding-practice";

/**
 * The learner's coding practice on their Progress page: solved questions,
 * the practice streak, and the way into the Coding Lab. Shown once there
 * is practice to show. (Coding time is already in the day's minutes.)
 */
export function ProgressPracticeCard() {
  const stats = usePracticeStats(null);
  const data = stats.data;
  if (!data) return null;
  const solved = data.solved.easy + data.solved.medium + data.solved.hard;
  const total =
    data.available.easy + data.available.medium + data.available.hard;
  if (total === 0 && data.submissions === 0) return null;
  return (
    <ElevatedCard
      aria-label="Coding practice"
      className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5 sm:p-7"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
        <CodeGlyph size={22} weight="bold" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-(--text)">Coding practice</h2>
        <p className="text-sm text-(--muted)">
          {solved} of {total} questions solved · {data.attempted} attempted ·{" "}
          {data.activeMinutes} min coding
        </p>
      </div>
      <p className="inline-flex items-center gap-1.5 text-sm">
        <Fire
          size={18}
          weight="fill"
          aria-hidden="true"
          className={data.streak.current ? "text-orange-500" : "text-(--muted)"}
        />
        <b className="text-(--text) tabular-nums">{data.streak.current}</b>
        <span className="text-(--muted)">day streak</span>
      </p>
      <Link
        to="/practice"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text) no-underline hover:bg-(--hover)"
      >
        Open Coding Lab
        <ArrowRight size={15} weight="bold" aria-hidden="true" />
      </Link>
    </ElevatedCard>
  );
}
