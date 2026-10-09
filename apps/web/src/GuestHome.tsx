import type { GuestHomePageResponse } from "@veolms/contracts";
import {
  DEFAULT_HOME_PAGE_SETTINGS,
  HOME_PAGE_HERO_LESSON,
} from "@veolms/contracts/home-page-defaults";
import { useEffect, useState } from "react";
import {
  GuestHomeCourseSection,
  type GuestHomeCourseCardActions,
} from "./home/guest/GuestHomeCourseSection";
import { GuestHomeDiscussions } from "./home/guest/GuestHomeDiscussions";
import { GuestHomeHero } from "./home/guest/GuestHomeHero";
import { GuestHomeHighlights } from "./home/guest/GuestHomeHighlights";
import { HeroLaptopVideo } from "./home/guest/HeroLaptopVideo";
import {
  getNewLearnerGreeting,
  getNewLearnerHero,
} from "./home/guest/newLearnerHero";
import {
  guestHomeBlockStart,
  guestHomeGutter,
  guestHomeSectionGap,
} from "./home/guest/guestHomeSpacing";
import { courseSurfaceElevation } from "./components/cardElevation";
import type { NavigateTo } from "./routing/navigation";
import { useGuestHomePage } from "./services/home";
import "./home/guest/guest-home-shell.css";

const FREE_COURSES_SECTION_ID = "guest-home-free-courses";

/**
 * True once the browser is idle after hydration. The prerendered page is
 * complete without a request; checking it against the current settings is
 * left until nothing more urgent is competing for the network.
 */
function useIdleAfterMount(skip: boolean) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (skip) return undefined;
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => setIdle(true), {
        timeout: 4000,
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(() => setIdle(true), 1500);
    return () => window.clearTimeout(timer);
  }, [skip]);
  return idle;
}

/**
 * The signed-out home page: an edge-to-edge hero, then the course rows with
 * what students say below them. Its copy, its sections and what they
 * show are configured by the academy admin (Home Page in the admin menu).
 *
 * A signed-in learner who has not enrolled in anything yet gets the same
 * page (`learnerName`), with the hero greeting them instead.
 *
 * In the production build the page arrives prerendered from build-time data
 * (`initialPage`). The browser then asks for the current page once it is
 * idle, so a change saved after that build still shows up without a new
 * build. Without build-time data (the dev server) the same layout loads the
 * page and shows skeletons meanwhile.
 */
export function GuestHome({
  onNavigatePage,
  courseCardActions,
  initialPage,
  initialCopy,
  learnerName,
}: {
  onNavigatePage: NavigateTo;
  courseCardActions: GuestHomeCourseCardActions;
  initialPage?: GuestHomePageResponse;
  /**
   * The page's words without its courses and discussions, for when the home
   * page is opened from another page: the copy shows at once and only the
   * rows wait for the page.
   */
  initialCopy?: GuestHomePageResponse;
  /**
   * Set for a signed-in learner with no enrolments, even when the account
   * has no display name (an empty string).
   */
  learnerName?: string;
}) {
  const idle = useIdleAfterMount(!initialPage);
  const pageQuery = useGuestHomePage({
    initialData: initialPage,
    enabled: !initialPage || idle,
  });
  const page = pageQuery.data;
  const copy = page ?? initialCopy;
  const isLoading = !page && pageQuery.isLoading;
  const isError = !page && pageQuery.isError;
  const retry = () => void pageQuery.refetch();

  // Without a page (still loading, or the request failed) the sections fall
  // back to the default headings around their skeleton or error state.
  const defaults = DEFAULT_HOME_PAGE_SETTINGS;
  const popular = copy?.popularCourses ?? {
    ...defaults.popularCourses,
    courses: [],
  };
  const free = copy?.freeCourses ?? { ...defaults.freeCourses, courses: [] };
  const discussions = copy?.discussions ?? {
    ...defaults.discussions,
    items: [],
  };
  const highlights = copy?.highlights ?? defaults.highlights;
  const configuredHero = copy?.hero ?? (isError ? defaults.hero : undefined);
  const isNewLearner = learnerName !== undefined;
  const hero =
    configuredHero && isNewLearner
      ? getNewLearnerHero(configuredHero)
      : configuredHero;

  // The free row is an extra: once the page is in and holds no free course,
  // the row and the hero action pointing at it are left out.
  const showFreeCourses =
    free.visible && (isLoading || isError || free.courses.length > 0);
  const showCourses = popular.visible || showFreeCourses;
  // Until it is played the laptop shows that lesson's course. The page says
  // which picture that is; an API that does not yet leaves it to the rows,
  // when one happens to list the course, and the screen stays dark behind
  // the button otherwise.
  const heroLaptopPoster =
    copy?.heroLessonPosterUrl ??
    [...popular.courses, ...free.courses].find(
      (course) => course.slug === HOME_PAGE_HERO_LESSON.courseSlug,
    )?.thumbnailUrl ??
    undefined;
  const showBody = showCourses || highlights.visible || discussions.visible;

  return (
    <div
      className={`guest-home-page @container/home min-w-0 ${courseSurfaceElevation}`}
    >
      <GuestHomeHero
        hero={hero}
        greeting={isNewLearner ? getNewLearnerGreeting(learnerName) : undefined}
        onNavigatePage={onNavigatePage}
        freeCoursesSectionId={
          showFreeCourses ? FREE_COURSES_SECTION_ID : undefined
        }
        laptopScreen={
          <HeroLaptopVideo
            lesson={HOME_PAGE_HERO_LESSON}
            poster={heroLaptopPoster}
          />
        }
      />
      {showBody ? (
        <div
          className={`grid min-w-0 pb-[clamp(1.75rem,3.6cqw,3rem)] ${guestHomeSectionGap} ${guestHomeGutter} ${guestHomeBlockStart}`}
        >
          {showCourses ? (
            <div
              className={`grid min-w-0 content-start ${guestHomeSectionGap}`}
            >
              {popular.visible ? (
                <GuestHomeCourseSection
                  id="guest-home-popular-courses"
                  title={popular.title}
                  subtitle={popular.subtitle}
                  courses={popular.courses}
                  cardActions={courseCardActions}
                  isLoading={isLoading}
                  isError={isError}
                  onRetry={retry}
                  onNavigatePage={onNavigatePage}
                />
              ) : null}
              {showFreeCourses ? (
                <GuestHomeCourseSection
                  id={FREE_COURSES_SECTION_ID}
                  title={free.title}
                  subtitle={free.subtitle}
                  courses={free.courses}
                  viewAllHref="/courses/free"
                  cardActions={courseCardActions}
                  isLoading={isLoading}
                  isError={isError}
                  onRetry={retry}
                  onNavigatePage={onNavigatePage}
                />
              ) : null}
            </div>
          ) : null}

          {highlights.visible ? (
            <GuestHomeHighlights items={highlights.items} />
          ) : null}

          {discussions.visible ? (
            <GuestHomeDiscussions
              title={discussions.title}
              discussions={discussions.items}
              isLoading={isLoading}
              onNavigatePage={onNavigatePage}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
