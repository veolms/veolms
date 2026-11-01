import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Play } from "@phosphor-icons/react/Play";
import { Button } from "../../components/Button";
import { getCoursePlayerPath } from "../../learning/coursePlayerNavigation";
import type { NavigateTo } from "../../routing/navigation";
import {
  formatCourseProgress,
  roundCourseProgress,
} from "../../learning/courseProgressFormat";
import type { CourseAccessResume } from "@veolms/contracts";
import { useLearningProgressResumeContext } from "../../services/learning-progress";
import { useCurriculumIntent } from "./curriculumIntent";
import {
  mergeIntentHandlers,
  type LessonOpenIntent,
} from "../../learning/lessonOpenIntent";
import {
  priceBarActionClasses,
  priceBarPaddingClasses,
  priceBarSurfaceClasses,
} from "./CoursePriceBar";

interface CourseLearnerProgressBarProps {
  /** The course's slug, or its id when it has none. */
  courseKey: string;
  courseTitle: string;
  /** How much of the course is done, 0 to 100, with up to two decimals. */
  progress: number;
  /**
   * The learner has watched some of it, which a long course can show as
   * 0.00% for a while (see `hasStartedCourse`).
   */
  started?: boolean;
  totalLessons: number;
  /**
   * Where the learner carries on, when the page already has it (the course
   * access answer carries it). Asked for here otherwise.
   */
  resume?: CourseAccessResume | null;
  onNavigatePage?: NavigateTo;
  /**
   * The lesson to carry on with, readied ahead of the press and opened
   * playing (the page's, shared with the play button on its picture).
   */
  openIntent?: LessonOpenIntent;
}

const placeholder =
  "animate-pulse rounded-md bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";

/**
 * What an enrolled learner gets where a visitor gets the price: how far they
 * are, and the button that opens the lesson to carry on with, on one line of
 * the page (they stack when the page is narrow).
 *
 * The percentage comes with the course; the lesson and the count of lessons
 * done are asked for here and arrive a moment later, so their places are held
 * until then and the band keeps its height.
 */
export function CourseLearnerProgressBar({
  courseKey,
  courseTitle,
  progress,
  started = false,
  totalLessons,
  resume,
  onNavigatePage,
  openIntent,
}: CourseLearnerProgressBarProps) {
  const resumeQuery = useLearningProgressResumeContext(courseKey, {
    enabled: !resume,
  });
  const place = resume ?? resumeQuery.data;
  const curriculumIntent = useCurriculumIntent();
  const percent = roundCourseProgress(progress);
  const lessonCount = place?.totalLessons ?? totalLessons;
  const isComplete = percent >= 100;
  const lesson = isComplete ? null : (place?.resumeLesson ?? null);
  // Started once anything of the course has been watched, a few seconds
  // included: the band then shows the bar (a sliver at 0.00%) and the
  // button says "Continue Learning", by the rule the home and the course
  // cards go by.
  const hasStarted =
    started ||
    percent > 0 ||
    (place?.completedLessons ?? 0) > 0 ||
    (place?.resumeLesson?.progressPercent ?? 0) > 0;

  const actionLabel = isComplete
    ? "Review Course"
    : hasStarted
      ? "Continue Learning"
      : "Start Learning";
  const openCourse = () => {
    if (openIntent) {
      openIntent.open((lessonNumber) =>
        onNavigatePage?.(getCoursePlayerPath(courseKey, lessonNumber)),
      );
      return;
    }
    onNavigatePage?.(
      lesson
        ? getCoursePlayerPath(courseKey, lesson.lessonNumber)
        : `/learn/${encodeURIComponent(courseKey)}`,
    );
  };

  return (
    <section
      className={priceBarSurfaceClasses}
      aria-label="Your progress in this course"
      data-fixed-radius
    >
      <div
        className={`${priceBarPaddingClasses} flex flex-col gap-5 @2xl/price:flex-row @2xl/price:items-center @2xl/price:justify-between @2xl/price:gap-10 @2xl/price:py-6!`}
      >
        {/* How far, on one line: "42% complete", then the count of lessons
            it stands for, with a thick bar under them. Beside the button
            the bar is as long as that line and no longer (the box takes
            its width from the words); stacked, it runs the box's width. */}
        <div className="flex min-w-0 flex-col gap-3 @2xl/price:w-fit @2xl/price:max-w-[60%] @2xl/price:min-w-64 @2xl/price:shrink-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex items-baseline gap-2 leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-(--text)">
              {isComplete ? (
                <CheckCircle
                  size={24}
                  weight="fill"
                  className="self-center text-emerald-500"
                  aria-hidden="true"
                />
              ) : null}
              <span className="text-[1.7rem] tabular-nums">
                {formatCourseProgress(percent)}
              </span>
              <span className="text-[1.3rem]">complete</span>
            </span>
            {place ? (
              <>
                <span
                  aria-hidden="true"
                  className="self-center text-[0.8rem] text-(--muted) opacity-70"
                >
                  •
                </span>
                <span className="text-[1.05rem] whitespace-nowrap text-(--muted) tabular-nums">
                  {place.completedLessons} of {lessonCount} lesson
                  {lessonCount === 1 ? "" : "s"}
                </span>
              </>
            ) : !resume && resumeQuery.isPending ? (
              <span className={`${placeholder} h-4 w-36 self-center`} />
            ) : null}
          </div>
          <span
            role="progressbar"
            aria-label={`${courseTitle} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="block h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_9%,transparent)]"
          >
            <span
              className={`block h-full rounded-full bg-linear-to-r transition-[width] duration-700 ease-out motion-reduce:transition-none ${
                hasStarted ? "min-w-2.5" : ""
              } ${
                isComplete
                  ? "from-emerald-500 to-emerald-400"
                  : "from-(--accent) to-[color-mix(in_srgb,var(--accent)_78%,white)]"
              }`}
              style={{ width: `${percent}%` }}
            />
          </span>
        </div>

        {/* The way on, as wide as its words need. */}
        <Button
          motion="static"
          className={`${priceBarActionClasses} w-full @2xl/price:w-auto @2xl/price:min-w-60`}
          {...mergeIntentHandlers(curriculumIntent, openIntent?.handlers)}
          onClick={openCourse}
        >
          <Play
            size="1.15em"
            weight="fill"
            className="shrink-0"
            aria-hidden="true"
          />
          <span className="truncate">{actionLabel}</span>
        </Button>
      </div>
    </section>
  );
}
