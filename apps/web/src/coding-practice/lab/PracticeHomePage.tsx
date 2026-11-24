import { Link, useLocation } from "react-router";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { ElevatedCard } from "../../components/ElevatedCard";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { PageHeading } from "../../components/PageHeading";
import { TimeAgo } from "../../components/TimeAgo";
import { getApiError } from "../../lib/api-error";
import {
  usePracticeCourses,
  usePracticeStats,
} from "../../services/coding-practice";
import { useDocumentTitle } from "../../routing/useDocumentTitle";
import { CODE_TONES, DifficultyLabel } from "../shared/ui";
import { PracticeCalendar, SolvedCard } from "./PracticeStats";
import { practicePath } from "./practicePaths";

const PAGE = "flex w-full min-w-0 flex-col gap-5 font-sans";

/**
 * /practice, the learner's Coding Lab: solved by difficulty, streak and a
 * year of practice, the courses with questions, and recent submits.
 */
export function PracticeHomePage() {
  useDocumentTitle("Coding Lab");
  const location = useLocation();
  const stats = usePracticeStats(null);
  const courses = usePracticeCourses();
  const slugById = new Map(
    (courses.data ?? []).map((course) => [course.courseId, course.slug]),
  );

  return (
    <main
      className={`${PAGE} ${CODE_TONES}`}
      aria-labelledby="practice-home-title"
    >
      <PageHeading
        id="practice-home-title"
        title="Coding Lab"
        description="Every coding question of your courses in one place: solve them, keep your streak, and see how far you have come."
      />
      {stats.data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SolvedCard stats={stats.data} />
          <PracticeCalendar stats={stats.data} />
        </div>
      ) : stats.isLoading ? (
        <span
          role="status"
          aria-label="Loading your practice"
          className="flex justify-center py-10 text-(--muted)"
        >
          <LoadingSpinnerIcon size={24} />
        </span>
      ) : null}

      <section aria-labelledby="practice-courses-title" className="grid gap-3">
        <h2
          id="practice-courses-title"
          className="text-base font-bold text-(--text)"
        >
          Your courses
        </h2>
        {courses.error ? (
          <ElevatedCard padded className="text-sm text-(--text-secondary)">
            {getApiError(courses.error).message}
          </ElevatedCard>
        ) : !courses.data ? null : courses.data.length === 0 ? (
          <ElevatedCard
            padded
            className="flex flex-col items-center gap-2 py-10 text-center"
          >
            <CodeGlyph
              size={28}
              weight="duotone"
              className="text-(--accent)"
              aria-hidden="true"
            />
            <p className="m-0 font-semibold text-(--text)">
              No coding questions yet
            </p>
            <p className="m-0 max-w-sm text-sm text-(--muted)">
              When a course you are in has practice, its questions appear here.
            </p>
            <Link
              to="/courses"
              className="mt-2 inline-flex h-9 items-center rounded-lg bg-(--accent) px-3.5 text-sm font-semibold text-(--on-accent) no-underline hover:bg-(--accent-hover)"
            >
              Browse courses
            </Link>
          </ElevatedCard>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {courses.data.map((course) => {
              const share = course.total ? course.solved / course.total : 0;
              return (
                <li key={course.courseId}>
                  <Link
                    to={practicePath(course.slug)}
                    className="block no-underline"
                  >
                    <ElevatedCard
                      padded
                      className="grid gap-3 transition-colors hover:bg-(--hover)"
                    >
                      <span className="line-clamp-2 font-semibold text-(--text)">
                        {course.title}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                        <span
                          className="block h-full rounded-full bg-(--code-pass)"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 text-xs text-(--muted)">
                        <span>
                          <b className="text-(--text)">{course.solved}</b> of{" "}
                          {course.total} solved
                        </span>
                        {course.attempted ? (
                          <span>{course.attempted} attempted</span>
                        ) : null}
                        {course.lastActivityAt ? (
                          <TimeAgo
                            value={course.lastActivityAt}
                            className="ml-auto"
                          />
                        ) : null}
                      </span>
                    </ElevatedCard>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {stats.data?.recent.length ? (
        <section aria-labelledby="practice-recent-title" className="grid gap-3">
          <h2
            id="practice-recent-title"
            className="text-base font-bold text-(--text)"
          >
            Recent submissions
          </h2>
          <ElevatedCard as="ul" className="m-0 list-none overflow-hidden p-0">
            {stats.data.recent.map((row, index) => {
              const slug = slugById.get(row.courseId);
              const content = (
                <>
                  <span
                    className={`w-28 shrink-0 text-sm font-bold ${row.passed ? "text-(--code-pass)" : "text-(--code-fail)"}`}
                  >
                    {row.passed ? "Accepted" : "Wrong Answer"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-(--text)">
                    {row.title}
                  </span>
                  <DifficultyLabel difficulty={row.difficulty} />
                  <TimeAgo
                    value={row.createdAt}
                    className="w-24 shrink-0 text-right text-xs text-(--muted) max-sm:hidden"
                  />
                </>
              );
              return (
                <li
                  key={`${row.assignmentId}-${index}`}
                  className="border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] first:border-t-0"
                >
                  {slug ? (
                    <Link
                      to={practicePath(slug, row.assignmentId)}
                      state={{ practiceFrom: location.pathname }}
                      className="flex items-center gap-3 px-4 py-3 no-underline hover:bg-(--hover) sm:px-5"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ElevatedCard>
        </section>
      ) : null}
    </main>
  );
}
