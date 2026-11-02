import type { EnrolledCourse } from "@veolms/contracts";
import type { ReactNode } from "react";
import type { NavigateTo } from "../../routing/navigation";
import type { CourseOpenOptions } from "../../courses/catalogue";
import { GuestHomeSectionHeader } from "../guest/GuestHomeSectionHeader";
import { LearnerCourseCard } from "./LearnerCourseCard";
import { learnerCourseGridClasses } from "./LearnerHomeSkeleton";

/**
 * The most the section ever shows: two rows of four on a large monitor. The
 * layout hides what a narrower page has no room for, so the rows it does
 * show are full ones: four rows on a phone, six cards in two or three
 * columns. The rest are a "View all" away.
 */
const MAX_COURSES = 8;
const FEWEST_SHOWN = 4;

/**
 * All of the learner's enrolled courses, the one the hero leads with among
 * them: the ones in progress first, then the ones not started, then the
 * finished.
 */
export function LearnerCoursesSection({
  courses,
  subtitle,
  courseMenu,
  setCourseMenu,
  getCourseHref,
  onOpenCourse,
  pinnedCourseId,
  onPinCourse,
  onUnpinCourse,
  onUnenrollCourse,
  onNavigatePage,
}: {
  courses: readonly EnrolledCourse[];
  subtitle: ReactNode;
  /** The id of the course whose menu is open, held by the page shell. */
  courseMenu: string | null;
  setCourseMenu: (courseId: string | null) => void;
  getCourseHref: (course: EnrolledCourse) => string;
  onOpenCourse: (course: EnrolledCourse, options?: CourseOpenOptions) => void;
  /** The course the learner pinned to the home, if they pinned one. */
  pinnedCourseId: string | null;
  /** Makes the course the one the home's hero leads with. */
  onPinCourse: (course: EnrolledCourse) => void;
  onUnpinCourse: () => void;
  /** Offers "Unenroll" in each course's menu (an admin's own courses). */
  onUnenrollCourse?: (course: EnrolledCourse) => void;
  onNavigatePage: NavigateTo;
}) {
  return (
    <section
      aria-labelledby="learner-home-courses-title"
      className="@container/courses min-w-0"
    >
      <GuestHomeSectionHeader
        id="learner-home-courses-title"
        title="My Courses"
        subtitle={subtitle}
        actionHref={
          courses.length > FEWEST_SHOWN ? "/courses/enrolled" : undefined
        }
        onNavigatePage={onNavigatePage}
      />
      <div className={`mt-5 ${learnerCourseGridClasses}`}>
        {courses.slice(0, MAX_COURSES).map((course, index) => (
          <LearnerCourseCard
            key={course.courseId}
            course={course}
            href={getCourseHref(course)}
            priority={index < 3}
            menuOpen={courseMenu === course.courseId}
            setMenuOpen={setCourseMenu}
            onOpen={(options) => onOpenCourse(course, options)}
            pinned={course.courseId === pinnedCourseId}
            onPin={() => onPinCourse(course)}
            onUnpin={onUnpinCourse}
            onUnenroll={
              onUnenrollCourse ? () => onUnenrollCourse(course) : undefined
            }
            onNavigatePage={onNavigatePage}
          />
        ))}
      </div>
    </section>
  );
}
