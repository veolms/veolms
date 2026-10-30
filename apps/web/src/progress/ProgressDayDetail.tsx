import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ConfettiIcon as Confetti } from "@phosphor-icons/react/Confetti";
import type {
  LearningHistoryCourse,
  LearningHistoryDay,
} from "@veolms/contracts";
import { formatDay } from "./progressDates";
import {
  dayStanding,
  describeStanding,
  eyebrowClasses,
  formatDuration,
  formatGoal,
  formatLessons,
} from "./progressFormat";

function CourseThumbnail({ course }: { course: LearningHistoryCourse }) {
  if (!course.thumbnailUrl) {
    return (
      <span
        aria-hidden="true"
        className="grid aspect-video w-16 shrink-0 place-items-center rounded-md bg-(--accent)/12 text-(--accent)"
      >
        <BookOpen size={16} weight="duotone" />
      </span>
    );
  }
  return (
    <img
      src={course.thumbnailUrl}
      alt=""
      width={64}
      height={36}
      loading="lazy"
      decoding="async"
      className="aspect-video w-16 shrink-0 rounded-md object-cover"
    />
  );
}

function coursePath(course: LearningHistoryCourse) {
  return `/courses/${encodeURIComponent(course.slug)}/overview`;
}

/**
 * One day in full: the time against that day's goal, and the courses it
 * went to, each a link to the course. A day recorded before courses were
 * kept has a total only.
 */
export function ProgressDayDetail({
  date,
  day,
  goalMinutes,
  courseById,
  onNavigatePage,
  className = "",
}: {
  date: string | null;
  day: LearningHistoryDay | undefined;
  /** The goal of a day without a record: the learner's goal now. */
  goalMinutes: number;
  courseById: ReadonlyMap<string, LearningHistoryCourse>;
  onNavigatePage?: (path: string) => void;
  className?: string;
}) {
  if (!date) {
    return (
      <div className={className}>
        <p className={eyebrowClasses}>Day</p>
        <p className="mt-2 text-sm text-(--muted)">
          Choose a day on the calendar to see what it went to.
        </p>
      </div>
    );
  }

  const standing = dayStanding(day);
  const seconds = day?.seconds ?? 0;
  const dayGoalMinutes = day?.goalMinutes ?? goalMinutes;
  const shares = (day?.courses ?? []).flatMap((share) => {
    const course = courseById.get(share.courseId);
    return course ? [{ ...share, course }] : [];
  });

  return (
    <div
      className={`min-w-0 ${className}`}
      aria-labelledby="progress-day-title"
      aria-live="polite"
    >
      <p className={eyebrowClasses}>Day</p>
      <h3
        id="progress-day-title"
        className="mt-1.5 text-base font-semibold text-(--text)"
      >
        {formatDay(date)}
      </h3>
      <p className="mt-1 text-sm text-(--muted)">
        <strong className="font-semibold text-(--text) tabular-nums">
          {formatDuration(seconds)}
        </strong>{" "}
        of the {formatGoal(dayGoalMinutes)} goal
        {day && day.completions > 0
          ? ` · ${formatLessons(day.completions)} finished`
          : ""}
      </p>
      {standing !== "none" ? (
        <p
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            standing === "beyond"
              ? "bg-emerald-500/12 text-emerald-500"
              : standing === "completed"
                ? "bg-(--accent)/12 text-(--accent)"
                : "bg-(--text)/6 text-(--muted)"
          }`}
        >
          {standing === "beyond" ? (
            <Confetti size={14} weight="fill" aria-hidden="true" />
          ) : standing === "completed" ? (
            <CheckCircle size={14} weight="fill" aria-hidden="true" />
          ) : null}
          {describeStanding(day)}
        </p>
      ) : null}

      {shares.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {shares.map(({ course, seconds: courseSeconds, completions }) => (
            <li key={course.id}>
              <a
                href={coursePath(course)}
                onClick={(event) => {
                  if (
                    !onNavigatePage ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.button !== 0
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onNavigatePage(coursePath(course));
                }}
                className="flex items-center gap-3 rounded-xl bg-(--text)/4 p-2.5 transition-colors hover:bg-(--text)/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                <CourseThumbnail course={course} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-semibold text-(--text)">
                    {course.title}
                  </strong>
                  <span className="mt-0.5 block text-xs text-(--muted) tabular-nums">
                    {formatDuration(courseSeconds)}
                    {completions > 0
                      ? ` · ${formatLessons(completions)} finished`
                      : ""}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-6 text-(--muted)">
          {standing === "none"
            ? "No learning was recorded on this day."
            : "The courses of this day were not recorded."}
        </p>
      )}
    </div>
  );
}
