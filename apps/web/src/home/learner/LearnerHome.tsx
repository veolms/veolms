import type { EnrolledCourse } from "@veolms/contracts";
import { useMemo, useState } from "react";
import { courseSurfaceElevation } from "../../components/cardElevation";
import type { NavigateTo } from "../../routing/navigation";
import { useCourses } from "../../services/courses";
import { useLearningSummary } from "../../services/learning-goals";
import { useLearningProgressResumeContext } from "../../services/learning-progress";
import {
  adaptEnrolledCourseToLearningCourse,
  type LearningCourse,
} from "../../StudentPages";
import {
  GuestHomeCourseSection,
  type GuestHomeCourseCardActions,
} from "../guest/GuestHomeCourseSection";
import {
  guestHomeBlockStart,
  guestHomeGutter,
  guestHomeSectionGap,
} from "../guest/guestHomeSpacing";
import { GUEST_HOME_COURSES_PER_SECTION } from "../guestHomeLimits";
import { getHomeTimeGreeting } from "../homeGreeting";
import { LearnerCoursesSection } from "./LearnerCoursesSection";
import { LearnerGoalScreen } from "./LearnerGoalScreen";
import { LearnerHomeHero } from "./LearnerHomeHero";
import {
  getEnrolledCourseKey,
  planLearnerHome,
  selectCoursesToExplore,
} from "./learnerHomePlan";
import "../guest/guest-home-shell.css";

/**
 * A learner with this many courses or more has enough of their own on the
 * page; with fewer, a row of courses they have not enrolled in fills it out.
 */
const EXPLORE_BELOW_ENROLLED_COUNT = 3;

const getCoursePlayerHref = (course: EnrolledCourse) =>
  `/learn/${encodeURIComponent(getEnrolledCourseKey(course))}`;

/**
 * The home of a learner who is enrolled in at least one course: the hero
 * leads with the course to carry on with (or to start, when nothing has
 * been started yet) and shows their learning goals on the laptop in the
 * picture; their courses follow.
 */
export function LearnerHome({
  enrolledCourses,
  learnerName,
  courseCardActions,
  onOpenCourse,
  onNavigatePage,
}: {
  enrolledCourses: readonly EnrolledCourse[];
  /** The learner's display name; it may be empty. */
  learnerName: string;
  /** What the cards of courses to explore need from the page shell. */
  courseCardActions: GuestHomeCourseCardActions;
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: NavigateTo;
}) {
  const plan = useMemo(
    () => planLearnerHome(enrolledCourses),
    [enrolledCourses],
  );
  const heroCourse = plan?.heroCourse;
  const heroCourseKey = heroCourse ? getEnrolledCourseKey(heroCourse) : "";

  const resumeQuery = useLearningProgressResumeContext(heroCourseKey, {
    enabled: Boolean(heroCourse),
  });
  // A course that has just taken the lead must not show the lesson of the
  // one before it while its own is on the way.
  const resumeContext =
    resumeQuery.data && resumeQuery.data.courseId === heroCourse?.courseId
      ? resumeQuery.data
      : null;

  const summaryQuery = useLearningSummary();

  const showExplore = enrolledCourses.length < EXPLORE_BELOW_ENROLLED_COUNT;
  const publishedQuery = useCourses({ enabled: showExplore });
  const coursesToExplore = useMemo(
    () =>
      selectCoursesToExplore(
        publishedQuery.data?.courses ?? [],
        enrolledCourses,
      ).slice(0, GUEST_HOME_COURSES_PER_SECTION),
    [enrolledCourses, publishedQuery.data?.courses],
  );

  // The clock is read once, when the page opens: the page is only ever
  // rendered in the browser, for a learner who is signed in.
  const [timeGreeting] = useState(() =>
    getHomeTimeGreeting(new Date().getHours()),
  );
  const firstName = learnerName.trim().split(/\s+/u)[0];
  const greeting = firstName
    ? `${timeGreeting}, ${firstName} 👋`
    : `${timeGreeting} 👋`;

  if (!plan || !heroCourse) return null;

  const openCourse = (course: EnrolledCourse) =>
    onOpenCourse(adaptEnrolledCourseToLearningCourse(course));
  const nothingStarted = plan.intent === "start";

  return (
    <div
      className={`learner-home-page @container/home min-w-0 ${courseSurfaceElevation}`}
    >
      <LearnerHomeHero
        greeting={greeting}
        intent={plan.intent}
        course={heroCourse}
        resume={{ context: resumeContext, isLoading: resumeQuery.isLoading }}
        courseHref={getCoursePlayerHref(heroCourse)}
        onOpenCourse={() => openCourse(heroCourse)}
        laptopScreen={
          <LearnerGoalScreen
            summary={summaryQuery.data}
            isLoading={summaryQuery.isLoading}
            onSetGoal={() => onNavigatePage("/settings/learning")}
          />
        }
      />

      <div
        className={`grid min-w-0 pb-[clamp(1.75rem,3.6cqw,3rem)] ${guestHomeSectionGap} ${guestHomeGutter} ${guestHomeBlockStart}`}
      >
        <LearnerCoursesSection
          courses={plan.courses}
          subtitle={
            nothingStarted
              ? "Start learning from your enrolled courses."
              : "Continue learning from your enrolled courses."
          }
          courseMenu={courseCardActions.courseMenu}
          setCourseMenu={courseCardActions.setCourseMenu}
          getCourseHref={getCoursePlayerHref}
          onOpenCourse={openCourse}
          onNavigatePage={onNavigatePage}
        />

        {showExplore &&
        (publishedQuery.isLoading || coursesToExplore.length > 0) ? (
          <GuestHomeCourseSection
            id="learner-home-explore-courses"
            title="Explore More Courses"
            subtitle="Find what you want to learn next."
            courses={coursesToExplore}
            viewAllHref="/courses/not-enrolled"
            cardActions={courseCardActions}
            isLoading={publishedQuery.isLoading}
            isError={false}
            onRetry={() => void publishedQuery.refetch()}
            onNavigatePage={onNavigatePage}
          />
        ) : null}
      </div>
    </div>
  );
}
