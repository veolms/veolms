import type { CourseSummary } from "@veolms/contracts";
import { CourseCard } from "../../courses/CourseCard";
import { CourseCardSkeleton } from "../../courses/CourseCardSkeleton";
import {
  courseMatchesWishlist,
  getCourseRouteKey,
  type Course,
  type CourseOpenOptions,
} from "../../courses/catalogue";
import { adaptCourseSummaryToCatalogueCourse } from "../../courses/courseAdapter";
import type { NavigateTo } from "../../routing/navigation";
import { GUEST_HOME_COURSES_PER_SECTION } from "../guestHomeLimits";
import { GuestHomeSectionHeader } from "./GuestHomeSectionHeader";

/**
 * What the home page's course cards need from the page shell to behave like
 * the cards on the Courses page: playing the free preview from the
 * thumbnail, the wishlist, and the card's own menu.
 */
export interface GuestHomeCourseCardActions {
  wishlisted: ReadonlySet<string>;
  onWishlist: (course: Course) => void;
  onOpenCourse: (course: Course, options?: CourseOpenOptions) => void;
  courseMenu: string | null;
  setCourseMenu: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
}

/**
 * The home page cards are narrower, so they leave the duration out and show
 * the figures as plain text.
 */
const guestHomeCardFacts = ["sections", "lectures"] as const;

/**
 * One row of cards, sized by the room the section actually has (the sidebar
 * changes it): a phone stacks two cards, then the row holds two or three
 * across. Laptop screens stay at three; only a large monitor (a section
 * 100rem or wider) shows four. Cards that do not fit are left out rather
 * than wrapped, so a section never grows a second row.
 */
const courseRowClasses = [
  "grid grid-cols-1 gap-4",
  "@max-lg/courses:[&>*:nth-child(n+3)]:hidden",
  "@lg/courses:grid-cols-2 @lg/courses:@max-2xl/courses:[&>*:nth-child(n+3)]:hidden",
  "@2xl/courses:grid-cols-3 @2xl/courses:gap-5 @2xl/courses:@max-[100rem]/courses:[&>*:nth-child(n+4)]:hidden",
  "@[100rem]/courses:grid-cols-4",
].join(" ");

export function GuestHomeCourseSection({
  id,
  title,
  subtitle,
  courses,
  viewAllHref,
  cardActions,
  isLoading,
  isError,
  onRetry,
  onNavigatePage,
}: {
  id: string;
  title: string;
  subtitle: string;
  courses: readonly CourseSummary[];
  /** Where "View all" leads; a section without it has no such link. */
  viewAllHref?: string;
  cardActions: GuestHomeCourseCardActions;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onNavigatePage: NavigateTo;
}) {
  const headingId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="@container/courses min-w-0 scroll-mt-6"
    >
      <GuestHomeSectionHeader
        id={headingId}
        title={title}
        subtitle={subtitle}
        actionHref={viewAllHref}
        onNavigatePage={onNavigatePage}
      />

      {isError ? (
        <div
          role="alert"
          className="mt-5 border-y border-[color-mix(in_srgb,var(--text)_10%,transparent)] py-8 text-center"
        >
          <p className="text-sm font-semibold text-(--text)">
            Courses are unavailable right now.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[color-mix(in_srgb,var(--text)_18%,transparent)] px-4 text-sm font-semibold text-(--text) transition-colors hover:border-(--accent) hover:text-(--accent-ink,var(--accent)) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            Try again
          </button>
        </div>
      ) : !isLoading && courses.length === 0 ? (
        <p
          role="status"
          className="mt-5 border-y border-[color-mix(in_srgb,var(--text)_10%,transparent)] py-8 text-center text-sm text-(--muted)"
        >
          New courses are on the way. Check back soon.
        </p>
      ) : (
        <div className={`mt-5 ${courseRowClasses}`} aria-busy={isLoading}>
          {isLoading
            ? Array.from(
                { length: GUEST_HOME_COURSES_PER_SECTION },
                (_, index) => <CourseCardSkeleton key={index} />,
              )
            : courses.map((summary) => {
                const course = adaptCourseSummaryToCatalogueCourse(summary);
                // The same card, wired the same way, as the Courses page
                // shows a visitor: the thumbnail plays the free preview.
                return (
                  <CourseCard
                    key={course.id}
                    course={course}
                    role="student"
                    wishlisted={courseMatchesWishlist(
                      course,
                      cardActions.wishlisted,
                    )}
                    onWishlist={cardActions.onWishlist}
                    onOpen={(selected) =>
                      cardActions.onOpenCourse(
                        selected,
                        selected.enrolled ? undefined : { preview: true },
                      )
                    }
                    onExplore={(selected) =>
                      onNavigatePage(
                        `/courses/${encodeURIComponent(getCourseRouteKey(selected))}/overview`,
                      )
                    }
                    onNavigatePage={onNavigatePage}
                    menuOpen={cardActions.courseMenu === course.id}
                    setMenuOpen={cardActions.setCourseMenu}
                    setNotice={cardActions.setNotice}
                    facts={guestHomeCardFacts}
                    factIcons={false}
                  />
                );
              })}
        </div>
      )}
    </section>
  );
}
