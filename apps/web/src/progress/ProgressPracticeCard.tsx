import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { ElevatedCard } from "../components/ElevatedCard";
import { TimeAgo } from "../components/TimeAgo";
import { CODE_TONES } from "../coding-practice/shared/ui";
import { practicePath } from "../coding-practice/lab/practicePaths";
import {
  usePracticeCourses,
  usePracticeStats,
} from "../services/coding-practice";
import { PracticeCalendar, SolvedCard } from "./ProgressPracticeStats";

/** The section's address on the page: /progress#coding-practice. */
const SECTION_ID = "coding-practice";
const RETURN_PATH = `/progress#${SECTION_ID}`;

/**
 * The learner's coding practice, as part of their progress: there is no
 * separate Coding Lab (owner, 25 Nov 2026). Questions are opened from
 * their lecture while learning; here are how far the learner got
 * (solved by difficulty, streak, a year of practice) and every course with
 * questions, each opening its list to pick up where they left off. Coding
 * minutes also count in the day's goal above. Shown once there is
 * practice to show.
 */
export function ProgressPracticeCard() {
  const stats = usePracticeStats(null);
  const courses = usePracticeCourses();
  const location = useLocation();
  const section = useRef<HTMLElement>(null);
  const data = stats.data;

  // Older /practice links and "back to practice" land on this section.
  const wanted = location.hash === `#${SECTION_ID}`;
  const ready = Boolean(data);
  useEffect(() => {
    if (!wanted || !ready) return undefined;
    // After the router has restored the page's scroll (it does so after
    // this renders), or the section would be scrolled away again.
    const timer = window.setTimeout(
      () => section.current?.scrollIntoView({ block: "start" }),
      150,
    );
    return () => window.clearTimeout(timer);
  }, [wanted, ready]);

  // Courses with something going on first, then the rest by name.
  const ordered = useMemo(
    () =>
      [...(courses.data ?? [])]
        .filter((course) => course.total > 0)
        .sort(
          (left, right) =>
            (right.lastActivityAt ? Date.parse(right.lastActivityAt) : 0) -
              (left.lastActivityAt ? Date.parse(left.lastActivityAt) : 0) ||
            left.title.localeCompare(right.title),
        ),
    [courses.data],
  );

  if (!data) return null;
  const total =
    data.available.easy + data.available.medium + data.available.hard;
  if (total === 0 && data.submissions === 0) return null;

  return (
    <section
      id={SECTION_ID}
      ref={section}
      aria-labelledby="progress-practice-title"
      className={`grid scroll-mt-6 gap-3 ${CODE_TONES}`}
    >
      <div>
        <h2
          id="progress-practice-title"
          className="text-base font-semibold text-(--text)"
        >
          Coding practice
        </h2>
        <p className="mt-1 text-sm text-(--muted)">
          The questions of your courses, your practice streak and the days you
          coded. Coding time counts in your daily goal.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SolvedCard stats={data} />
        <PracticeCalendar stats={data} />
      </div>
      {ordered.length ? (
        <ElevatedCard padded className="grid gap-3">
          <h3 className="text-sm font-semibold text-(--text)">
            Questions by course
          </h3>
          <ul className="grid gap-1.5">
            {ordered.map((course) => {
              const share = course.total ? course.solved / course.total : 0;
              const done = course.solved >= course.total;
              return (
                <li key={course.courseId}>
                  <Link
                    to={practicePath(course.slug)}
                    state={{ practiceFrom: RETURN_PATH }}
                    // Phones: less padding and a smaller picture, so the
                    // course name keeps the room (the card has its own).
                    className="group/course flex items-center gap-2.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_2.5%,transparent)] px-2.5 py-2.5 no-underline sm:gap-3 sm:px-3 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                  >
                    {course.thumbnailUrl ? (
                      <img
                        src={course.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-9 w-12 shrink-0 rounded-md object-cover sm:h-10 sm:w-16"
                      />
                    ) : (
                      <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent) sm:h-10 sm:w-16">
                        <CodeGlyph size={18} weight="bold" aria-hidden="true" />
                      </span>
                    )}
                    <span className="grid min-w-0 flex-1 gap-1.5">
                      {/* Two lines on a phone rather than cut short. */}
                      <span className="line-clamp-2 text-sm font-semibold break-words text-(--text) sm:line-clamp-1">
                        {course.title}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                        <span
                          className="block h-full rounded-full bg-(--code-pass)"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </span>
                      <span className="text-xs text-(--muted) tabular-nums">
                        <b className="text-(--text)">{course.solved}</b> of{" "}
                        {course.total} solved
                        {course.attempted
                          ? ` · ${course.attempted} started`
                          : ""}
                        {done ? " · all done" : ""}
                        {course.lastActivityAt ? (
                          <>
                            {" · "}
                            <TimeAgo value={course.lastActivityAt} />
                          </>
                        ) : null}
                      </span>
                    </span>
                    <CaretRight
                      size={16}
                      weight="bold"
                      aria-hidden="true"
                      className="shrink-0 text-(--muted) transition-transform group-hover/course:translate-x-0.5"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </ElevatedCard>
      ) : null}
    </section>
  );
}
