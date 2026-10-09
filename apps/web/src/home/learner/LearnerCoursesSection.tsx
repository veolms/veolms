import type { EnrolledCourse } from "@veolms/contracts";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeSectionHeader } from "../guest/GuestHomeSectionHeader";
import { LearnerCourseCard } from "./LearnerCourseCard";

/**
 * The most the section ever shows: two rows of four on a large monitor. The
 * layout hides what a narrower page has no room for, so the rows it does
 * show are full ones: four rows on a phone, six cards in two or three
 * columns. The rest are a "View all" away.
 */
const MAX_COURSES = 8;
const FEWEST_SHOWN = 4;

const courseGridClasses = [
  "grid grid-cols-1 gap-3",
  "@max-lg/courses:[&>*:nth-child(n+5)]:hidden",
  "@lg/courses:grid-cols-2 @lg/courses:gap-4 @lg/courses:@max-[100rem]/courses:[&>*:nth-child(n+7)]:hidden",
  "@2xl/courses:grid-cols-3 @2xl/courses:gap-5",
  "@[100rem]/courses:grid-cols-4",
].join(" ");

/** The learner's enrolled courses, the one they are in first. */
export function LearnerCoursesSection({
  courses,
  subtitle,
  courseMenu,
  setCourseMenu,
  getCourseHref,
  onOpenCourse,
  onNavigatePage,
}: {
  courses: readonly EnrolledCourse[];
  subtitle: string;
  /** The id of the course whose menu is open, held by the page shell. */
  courseMenu: string | null;
  setCourseMenu: (courseId: string | null) => void;
  getCourseHref: (course: EnrolledCourse) => string;
  onOpenCourse: (course: EnrolledCourse) => void;
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
      <div className={`mt-5 ${courseGridClasses}`}>
        {courses.slice(0, MAX_COURSES).map((course, index) => (
          <LearnerCourseCard
            key={course.courseId}
            course={course}
            href={getCourseHref(course)}
            priority={index < 3}
            menuOpen={courseMenu === course.courseId}
            setMenuOpen={setCourseMenu}
            onOpen={() => onOpenCourse(course)}
            onNavigatePage={onNavigatePage}
          />
        ))}
      </div>
    </section>
  );
}
