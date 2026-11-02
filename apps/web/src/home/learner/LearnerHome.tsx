import type { EnrolledCourse } from "@veolms/contracts";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PrefetchPageLinks } from "react-router";
import type { NavigateTo } from "../../routing/navigation";
import type { CourseOpenOptions } from "../../courses/catalogue";
import { getCoursePlayerPath } from "../../learning/coursePlayerNavigation";
import { requestLessonAutoplay } from "../../learning/lessonAutoplayRequest";
import { beginLessonOpening } from "../../learning/lessonOpeningState";
import { primeRouteStylesheets } from "../../routing/routeStylesheetPrimer";
import { useCurrentUser } from "../../services/auth";
import { useCourses } from "../../services/courses";
import { hasAdminRole } from "../../shell/workspaceRole";
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
import { GUEST_HOME_COURSES_PER_SECTION } from "../guestHomeLimits";
import { getHomeTimeGreeting } from "../homeGreeting";
import { LearnerCoursesSection } from "./LearnerCoursesSection";
import {
  LearnerCoursesSubtitle,
  rememberLearnerStarted,
} from "./learnerCoursesSubtitle";
import { LearnerGoalCard } from "./LearnerGoalCard";
import { LearnerGoalScreen } from "./LearnerGoalScreen";
import { LearnerHeroPinDrop } from "./LearnerHeroPinDrop";
import { LearnerHomeHero } from "./LearnerHomeHero";
import {
  LearnerCoursesSkeleton,
  LearnerResumeRowSkeleton,
  learnerHomeBodyClasses,
  learnerHomePageClasses,
} from "./LearnerHomeSkeleton";
import { LearnerResumeRow } from "./LearnerResumeRow";
import { useIsPhone } from "./useIsPhone";
import { useHeroLessonWarmUp } from "./useHeroLessonWarmUp";
import {
  useLearnerHomeHandOver,
  useLearnerHomeSnapshot,
} from "./learnerHomeSnapshot";
import { useDraggedPinCourseId } from "./pinCourseDrag";
import { pinHomeCourse, usePinnedHomeCourseId } from "./pinnedHomeCourse";
import {
  getEnrolledCourseKey,
  hasStartedCourse,
  planLearnerHome,
  selectCoursesToExplore,
} from "./learnerHomePlan";
import "../guest/guest-home-shell.css";

// Asked for only once an admin picks "Unenroll" from a course's menu.
const UnenrollCourseModal = lazy(() =>
  import("../../courses/UnenrollCourseModal").then((module) => ({
    default: module.UnenrollCourseModal,
  })),
);

/**
 * A learner with this many courses or more has enough of their own on the
 * page; with fewer, a row of courses they have not enrolled in fills it out.
 */
const EXPLORE_BELOW_ENROLLED_COUNT = 3;

const NO_COURSES: readonly EnrolledCourse[] = [];

const getCoursePlayerHref = (course: EnrolledCourse) =>
  `/learn/${encodeURIComponent(getEnrolledCourseKey(course))}`;

/**
 * The home of a learner who is enrolled in at least one course: the hero
 * leads with the course to carry on with (or to start, when nothing has
 * been started yet) and shows their learning goals on the laptop in the
 * picture; their other courses follow.
 *
 * It is on the page before the courses are known. Until then the picture,
 * the date, the greeting, the quote and the list's heading are all there,
 * and only the course's row and the cards are placeholders; they give way
 * in place when the courses arrive, and nothing else is drawn again.
 */
export function LearnerHome({
  enrolledCourses: knownCourses,
  sessionPending = false,
  learnerName,
  courseCardActions,
  onOpenCourse,
  onNavigatePage,
}: {
  /** The learner's courses, once they are known. */
  enrolledCourses: readonly EnrolledCourse[] | undefined;
  /**
   * The session has not answered yet, so nothing of the learner's own may be
   * asked for.
   */
  sessionPending?: boolean;
  /** The learner's display name; it may be empty. */
  learnerName: string;
  /** What the cards of courses to explore need from the page shell. */
  courseCardActions: GuestHomeCourseCardActions;
  onOpenCourse: (course: LearningCourse, options?: CourseOpenOptions) => void;
  onNavigatePage: NavigateTo;
}) {
  const enrolledCourses = knownCourses ?? NO_COURSES;
  // An admin in Student view, or a shared test account, can leave any
  // course they enrolled in; doing so clears their progress in it.
  const currentUser = useCurrentUser().data;
  const leavesAnyCourse =
    hasAdminRole(currentUser?.roles) || Boolean(currentUser?.isTestAccount);
  const [pendingUnenroll, setPendingUnenroll] = useState<EnrolledCourse | null>(
    null,
  );
  const pinnedCourseId = usePinnedHomeCourseId();
  // Counts the pins made on this page; each one plays the hero row's
  // "pinned" motion. A pin already there when the page opens is not one.
  const [pinPulse, setPinPulse] = useState(0);
  const draggedCourseId = useDraggedPinCourseId();
  const plan = useMemo(
    () => planLearnerHome(enrolledCourses, pinnedCourseId),
    [enrolledCourses, pinnedCourseId],
  );
  const heroCourse = plan?.heroCourse;
  // The hero's course already leads the page, pinned or picked for the
  // learner, so "My Courses" leaves it out rather than showing it twice; it
  // comes back there once another course takes the hero's place.
  const listedCourses = useMemo(
    () =>
      plan
        ? plan.courses.filter(
            (course) => course.courseId !== plan.heroCourse.courseId,
          )
        : [],
    [plan],
  );
  const heroCourseKey = heroCourse ? getEnrolledCourseKey(heroCourse) : "";

  // Asked for once the session is confirmed. Until then the copy this tab
  // kept is shown (see services/accountSessionCopies.ts).
  const resumeQuery = useLearningProgressResumeContext(heroCourseKey, {
    enabled: Boolean(heroCourse) && !sessionPending,
  });
  // A course that has just taken the lead must not show the lesson of the
  // one before it while its own is on the way.
  const resumeContext =
    resumeQuery.data && resumeQuery.data.courseId === heroCourse?.courseId
      ? resumeQuery.data
      : null;

  const summaryQuery = useLearningSummary({ enabled: !sessionPending });

  // The lesson the hero's Enter opens, readied before it is pressed (see
  // useHeroLessonWarmUp). A finished course opens as a whole, on no lesson.
  const warmLesson =
    !sessionPending && plan?.intent !== "review" && resumeContext?.resumeLesson
      ? {
          courseSlug: resumeContext.courseSlug,
          lessonNumber: resumeContext.resumeLesson.lessonNumber,
        }
      : null;
  useHeroLessonWarmUp(warmLesson);

  const showExplore =
    Boolean(knownCourses) &&
    enrolledCourses.length < EXPLORE_BELOW_ENROLLED_COUNT;
  const publishedQuery = useCourses({ enabled: showExplore, keptInTab: true });
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
  const firstName = learnerName.trim().split(/\s+/u)[0] ?? "";

  // Kept for the next load of this tab once everything on it has arrived,
  // and put back before that load's first paint (see learnerHomeSnapshot).
  const pageRef = useRef<HTMLDivElement>(null);
  useLearnerHomeSnapshot(
    pageRef,
    currentUser?.id ?? null,
    !sessionPending &&
      Boolean(knownCourses) &&
      !resumeQuery.isLoading &&
      Boolean(summaryQuery.data),
  );
  useLearnerHomeHandOver();

  const coursesKnown = Boolean(knownCourses);
  const anythingStarted = enrolledCourses.some(hasStartedCourse);
  useEffect(() => {
    if (coursesKnown) rememberLearnerStarted(anythingStarted);
  }, [anythingStarted, coursesKnown]);

  // A phone shows no laptop, and its screen's wallpaper is not loaded
  // there: the goals are a card of their own instead.
  const isPhone = useIsPhone();
  const goalProps = {
    summary: summaryQuery.data,
    isLoading: sessionPending || summaryQuery.isLoading,
  };
  const laptopScreen = isPhone ? undefined : (
    <LearnerGoalScreen {...goalProps} />
  );
  const goalCard = <LearnerGoalCard {...goalProps} />;

  if (!knownCourses) {
    return (
      <div className={learnerHomePageClasses}>
        <LearnerHomeHero
          timeGreeting={timeGreeting}
          firstName={firstName}
          namePending={sessionPending}
          resumeRow={<LearnerResumeRowSkeleton />}
          goalCard={goalCard}
          laptopScreen={laptopScreen}
        />
        <div className={learnerHomeBodyClasses}>
          <LearnerCoursesSkeleton />
        </div>
      </div>
    );
  }

  if (!plan || !heroCourse) return null;

  const openCourse = (course: EnrolledCourse, options?: CourseOpenOptions) =>
    onOpenCourse(adaptEnrolledCourseToLearningCourse(course), options);
  // The hero's card names the lesson to carry on with, so that is the one
  // it opens. Opening the course without naming a lesson lands on whichever
  // one this browser last remembered, or the first on a new device. A
  // finished course has no lesson to carry on with and is opened as a whole.
  const heroLesson =
    plan.intent === "review" ? null : resumeContext?.resumeLesson;
  const heroLessonPath =
    resumeContext && heroLesson
      ? getCoursePlayerPath(resumeContext.courseSlug, heroLesson.lessonNumber)
      : null;
  const nothingStarted = !anythingStarted;
  // A pin is said twice: the hero's row marks it with a motion of its own,
  // and the page's message names the course. Taking a pin off moves nothing
  // near the card it was taken off from, so that is said too.
  const pinAndSay = (courseId: string) => {
    pinHomeCourse(courseId);
    setPinPulse((count) => count + 1);
    const title = enrolledCourses.find(
      (course) => course.courseId === courseId,
    )?.courseTitle;
    courseCardActions.setNotice(
      title ? `${title} is pinned to Home.` : "Course pinned to Home.",
    );
  };
  const unpinAndSay = () => {
    pinHomeCourse(null);
    courseCardActions.setNotice("Unpinned from Home.");
  };
  // The pinned course takes the hero's place at the top of the page, so the
  // learner is taken there to see it happen.
  const pinCourse = (course: EnrolledCourse) => {
    pinAndSay(course.courseId);
    document.getElementById("learner-home-hero-title")?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <div ref={pageRef} className={learnerHomePageClasses}>
      {/* The lesson page's code and stylesheets, fetched ahead of Enter;
          React puts these links in the document's head. */}
      <PrefetchPageLinks
        page={heroLessonPath ?? getCoursePlayerHref(heroCourse)}
      />
      <LearnerHomeHero
        timeGreeting={timeGreeting}
        firstName={firstName}
        namePending={false}
        resumeRow={
          <LearnerResumeRow
            course={heroCourse}
            intent={plan.intent}
            resume={{
              context: resumeContext,
              isLoading: resumeQuery.isLoading,
            }}
            pinned={plan.heroPinned}
            pinPulse={pinPulse}
            onUnpin={unpinAndSay}
            onNavigatePage={onNavigatePage}
            href={heroLessonPath ?? getCoursePlayerHref(heroCourse)}
            onOpen={() => {
              // The tap is answered now, not once the stylesheets below and
              // the lesson page's code are in.
              beginLessonOpening();
              if (!heroLessonPath || !resumeContext) {
                openCourse(heroCourse);
                return;
              }
              // The lesson is ready to play (see useHeroLessonWarmUp), and
              // Enter means play it: it opens playing.
              requestLessonAutoplay(resumeContext.courseSlug);
              // Its stylesheets were fetched beside the hero; linked
              // switched off first, they do not restyle this page on the
              // way out (see primeRouteStylesheets).
              void primeRouteStylesheets("learning").then(() => {
                // The focus is on the key just pressed, and Chrome
                // restyles the whole page (some 35 ms here) when the
                // element holding the focus is taken out of it, as the
                // lesson page replaces this one. It would go to the
                // document then anyway.
                const focused = document.activeElement;
                if (
                  focused instanceof HTMLElement &&
                  pageRef.current?.contains(focused)
                ) {
                  focused.blur();
                }
                onNavigatePage(heroLessonPath);
              });
            }}
            // A course card dragged from the list below is pinned by
            // dropping it on the hero's own course card.
            pinDrop={
              draggedCourseId ? <LearnerHeroPinDrop onPin={pinAndSay} /> : null
            }
          />
        }
        goalCard={goalCard}
        laptopScreen={laptopScreen}
      />

      <div className={learnerHomeBodyClasses}>
        {listedCourses.length > 0 ? (
          <LearnerCoursesSection
            courses={listedCourses}
            subtitle={<LearnerCoursesSubtitle started={!nothingStarted} />}
            courseMenu={courseCardActions.courseMenu}
            setCourseMenu={courseCardActions.setCourseMenu}
            getCourseHref={getCoursePlayerHref}
            onOpenCourse={openCourse}
            pinnedCourseId={plan.heroPinned ? heroCourse.courseId : null}
            onPinCourse={pinCourse}
            onUnpinCourse={unpinAndSay}
            onUnenrollCourse={leavesAnyCourse ? setPendingUnenroll : undefined}
            onNavigatePage={onNavigatePage}
          />
        ) : null}

        {showExplore &&
        (publishedQuery.isLoading ||
          publishedQuery.isError ||
          coursesToExplore.length > 0) ? (
          <GuestHomeCourseSection
            id="learner-home-explore-courses"
            title="Explore More Courses"
            subtitle="Find what you want to learn next."
            courses={coursesToExplore}
            viewAllHref="/courses/not-enrolled"
            cardActions={courseCardActions}
            isLoading={publishedQuery.isLoading}
            // A failed load used to be passed on as "no error", and the
            // section was left out altogether: nothing said the courses had
            // failed to load and the retry below could never be reached.
            isError={publishedQuery.isError && coursesToExplore.length === 0}
            onRetry={() => void publishedQuery.refetch()}
            onNavigatePage={onNavigatePage}
          />
        ) : null}
      </div>

      {pendingUnenroll ? (
        <Suspense fallback={null}>
          <UnenrollCourseModal
            course={{
              id: pendingUnenroll.courseId,
              title: pendingUnenroll.courseTitle,
            }}
            resetsProgress
            onClose={() => setPendingUnenroll(null)}
            setNotice={courseCardActions.setNotice}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
