import { Link } from "react-router";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { usePracticeStats } from "../services/coding-practice";
import { PracticeCalendar, SolvedCard } from "./ProgressPracticeStats";

/**
 * The learner's coding practice, as part of their progress (not a page of
 * its own): questions solved by difficulty, attempts, submits, coding time,
 * the practice streak and a year of practice. Coding minutes also count in
 * the day's goal above. Shown once there is practice to show.
 */
export function ProgressPracticeCard() {
  const stats = usePracticeStats(null);
  const data = stats.data;
  if (!data) return null;
  const total =
    data.available.easy + data.available.medium + data.available.hard;
  if (total === 0 && data.submissions === 0) return null;
  return (
    <section aria-labelledby="progress-practice-title" className="grid gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <h2
            id="progress-practice-title"
            className="text-base font-semibold text-(--text)"
          >
            Coding practice
          </h2>
          <p className="mt-1 text-sm text-(--muted)">
            Questions you solved, your practice streak and the days you coded.
            Coding time counts in your daily goal.
          </p>
        </div>
        <Link
          to="/practice"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text) no-underline hover:bg-(--hover)"
        >
          Open Coding Lab
          <ArrowRight size={15} weight="bold" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SolvedCard stats={data} />
        <PracticeCalendar stats={data} />
      </div>
    </section>
  );
}
