import { Link } from "react-router";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { ElevatedCard } from "../../components/ElevatedCard";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { PageHeading } from "../../components/PageHeading";
import { TimeAgo } from "../../components/TimeAgo";
import { getApiError } from "../../lib/api-error";
import { usePracticeCourses } from "../../services/coding-practice";
import { useDocumentTitle } from "../../routing/useDocumentTitle";
import { CODE_TONES } from "../shared/ui";
import { practicePath } from "./practicePaths";

const PAGE = "flex w-full min-w-0 flex-col gap-5 font-sans";

/**
 * /practice, the Coding Lab: the learner's courses that have coding
 * questions. Their progress (solved, streak, calendar) is on the Progress
 * page, not here.
 */
export function PracticeHomePage() {
  useDocumentTitle("Coding Lab");
  const courses = usePracticeCourses();

  return (
    <main
      className={`${PAGE} ${CODE_TONES}`}
      aria-labelledby="practice-home-title"
    >
      <div className="flex flex-wrap items-end gap-3">
        <PageHeading
          id="practice-home-title"
          title="Coding Lab"
          description="The coding questions of your courses, in one place. Pick a course and solve them in the browser."
        />
        <Link
          to="/progress"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text) no-underline hover:bg-(--hover)"
        >
          Your progress
          <ArrowRight size={15} weight="bold" aria-hidden="true" />
        </Link>
      </div>

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
        ) : !courses.data ? (
          <span
            role="status"
            aria-label="Loading your courses"
            className="flex justify-center py-10 text-(--muted)"
          >
            <LoadingSpinnerIcon size={24} />
          </span>
        ) : courses.data.length === 0 ? (
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
    </main>
  );
}
