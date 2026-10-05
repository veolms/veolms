import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import type { CourseSummary, EnrolledCourse } from "@veolms/contracts";
import { CourseCardSkeleton } from "../courses/CourseCardSkeleton";
import { courseCatalogueHorizontalRowClasses } from "../courses/CourseCatalogueSkeleton";
import { PublicCourseCard } from "../courses/CourseCard";
import { adaptCourseSummaryToCatalogueCourse } from "../courses/courseAdapter";
import { HomeCourseRow } from "./HomeCourseRow";
import { HomeSectionHeader } from "./HomePresentation";

export function getEnrolledCourseKeys(
  enrolledCourses: readonly Pick<EnrolledCourse, "courseId" | "courseSlug">[],
) {
  const keys = new Set<string>();

  for (const course of enrolledCourses) {
    keys.add(course.courseId);
    if (course.courseSlug) keys.add(course.courseSlug);
  }

  return keys;
}

export function getRecommendedCourses(
  publishedCourses: readonly CourseSummary[],
  enrolledCourseKeys: ReadonlySet<string>,
) {
  return publishedCourses
    .filter(
      (course) =>
        !enrolledCourseKeys.has(course.id) &&
        !enrolledCourseKeys.has(course.slug),
    )
    .map((course, index) => ({
      course,
      index,
      paidRank: course.pricing.pricingType === "paid" ? 0 : 1,
    }))
    .sort(
      (left, right) =>
        left.paidRank - right.paidRank || left.index - right.index,
    )
    .map(({ course }) => course);
}

interface MoreCoursesPanelProps {
  courses: readonly CourseSummary[];
  isLoading: boolean;
  onNavigatePage: (destination: string) => void;
  id?: string;
  className?: string;
}

export function MoreCoursesPanel({
  courses,
  isLoading,
  onNavigatePage,
  id = "student-home-more-courses",
  className = "student-home-zero-progress__more-courses-panel",
}: MoreCoursesPanelProps) {
  return (
    <section
      className={[
        "dashboard-panel",
        "home-course-section",
        className,
        "min-w-0",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={`${id}-title`}
    >
      <HomeSectionHeader
        icon={BookOpen}
        title="More Courses for You"
        id={`${id}-title`}
        subtitle="Discover more courses to keep learning."
        action="Explore all"
        onAction={() => onNavigatePage("/courses")}
      />
      <div className="home-course-section__row">
        <HomeCourseRow
          id={id}
          label="More Courses for You"
          isBusy={isLoading}
          viewportClassName={courseCatalogueHorizontalRowClasses}
        >
          {isLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <CourseCardSkeleton
                key={`more-courses-skeleton-${index}`}
                variant="public"
              />
            ))
          ) : courses.length === 0 ? (
            <div className="grid min-h-40 min-w-full place-items-center rounded-lg border border-(--border) px-4 py-6 text-center text-sm text-(--muted)">
              There are no additional courses to recommend right now.
            </div>
          ) : (
            courses.map((course, index) => (
              <PublicCourseCard
                key={course.id}
                course={adaptCourseSummaryToCatalogueCourse(course)}
                imagePriority={index < 2}
                publicAction="enroll"
                onNavigatePage={onNavigatePage}
              />
            ))
          )}
        </HomeCourseRow>
      </div>
    </section>
  );
}
