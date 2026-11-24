import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ElevatedCard } from "../../components/ElevatedCard";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { PageHeading } from "../../components/PageHeading";
import { getApiError } from "../../lib/api-error";
import { useCoursePublicCurriculum } from "../../services/courses";
import { useCoursePractice } from "../../services/coding-practice";
import { useDocumentTitle } from "../../routing/useDocumentTitle";
import { ProblemTable } from "./ProblemTable";
import { practicePath } from "./practicePaths";
import { usePreloadPracticeWorkspace } from "./usePreloadPracticeWorkspace";

const PAGE = "flex w-full min-w-0 flex-col gap-5 font-sans";

/** /practice/<course>: the course's questions, with the learner's progress. */
export function CoursePracticePage() {
  const { courseSlug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const curriculum = useCoursePublicCurriculum(courseSlug);
  const courseId = curriculum.data?.course.id ?? null;
  const practice = useCoursePractice(courseId);
  usePreloadPracticeWorkspace(Boolean(practice.data?.length));
  const title = curriculum.data?.course.title ?? "Coding Lab";
  useDocumentTitle(`${title} · Coding Lab`);

  const next =
    practice.data?.find((item) => item.status === "started") ??
    practice.data?.find((item) => item.status === "new");

  const error = curriculum.error ?? practice.error;
  return (
    <main className={PAGE} aria-labelledby="practice-course-title">
      <div className="flex flex-wrap items-end gap-3">
        <PageHeading
          id="practice-course-title"
          title={title}
          description="Practise what each lecture teaches. Solve in the browser; your progress, streak and time are saved."
          onNavigateBack={() => navigate(practicePath())}
        />
        {next ? (
          <Link
            to={practicePath(courseSlug, next.assignmentId)}
            state={{ practiceFrom: location.pathname }}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) no-underline hover:bg-(--accent-hover)"
          >
            {next.status === "started" ? "Continue" : "Start"}: {next.title}
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {error ? (
        <ElevatedCard padded className="text-sm text-(--text-secondary)">
          {getApiError(error).status === 404
            ? "This course has no practice, or it is not open to you."
            : getApiError(error).message}
        </ElevatedCard>
      ) : !practice.data ? (
        <span
          role="status"
          aria-label="Loading questions"
          className="flex justify-center py-16 text-(--muted)"
        >
          <LoadingSpinnerIcon size={24} />
        </span>
      ) : practice.data.length === 0 ? (
        <ElevatedCard padded className="text-sm text-(--text-secondary)">
          This course has no coding questions yet.
        </ElevatedCard>
      ) : (
        <>
          <p className="text-sm text-(--muted)">
            <b className="text-(--text)">
              {practice.data.filter((item) => item.status === "done").length}
            </b>{" "}
            of {practice.data.length} solved. Your streak and practice calendar
            are on the{" "}
            <Link
              to="/progress"
              className="font-semibold text-(--accent) hover:underline"
            >
              Progress
            </Link>{" "}
            page.
          </p>
          <ProblemTable
            courseSlug={courseSlug}
            items={practice.data}
            returnPath={location.pathname}
          />
        </>
      )}
    </main>
  );
}
