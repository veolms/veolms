import { ArrowsDownUp } from "@phosphor-icons/react/ArrowsDownUp";
import { Funnel } from "@phosphor-icons/react/Funnel";
import { Heart } from "@phosphor-icons/react/Heart";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/Plus";
import { X } from "@phosphor-icons/react/X";
import { ThemedSelect } from "../ThemedSelect";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { CourseCard } from "./CourseCard";
import type {
  Course,
  CourseCategory,
  CourseEnrollmentFilter,
  CourseRole,
  CourseSort,
} from "./catalogue";

export interface CourseCatalogueProps {
  activeSection: string;
  role: CourseRole;
  wishlisted: ReadonlySet<string>;
  enrollmentFilter: CourseEnrollmentFilter;
  onEnrollmentFilterChange: (filter: CourseEnrollmentFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sort: CourseSort;
  onSortChange: (sort: CourseSort) => void;
  category: "all" | CourseCategory;
  onCategoryChange: (category: "all" | CourseCategory) => void;
  visibleCourses: readonly Course[];
  onWishlist: (courseId: string) => void;
  onOpenCourse: (course: Course) => void;
  onEditCourse?: (course: Course) => void;
  courseMenu: string | null;
  setCourseMenu: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  onNavigatePage: (destination: string) => void;
  onResetCatalogue: () => void;
}

export function CourseCatalogue({
  activeSection,
  role,
  wishlisted,
  enrollmentFilter,
  onEnrollmentFilterChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  category,
  onCategoryChange,
  visibleCourses,
  onWishlist,
  onOpenCourse,
  onEditCourse,
  courseMenu,
  setCourseMenu,
  setNotice,
  onNavigatePage,
  onResetCatalogue,
}: CourseCatalogueProps) {
  return (
    <>
      <div className="courses-heading-row">
        <div>
          <h1>{activeSection}</h1>
          {activeSection === "Wishlist" && (
            <p>
              {wishlisted.size} saved{" "}
              {wishlisted.size === 1 ? "course" : "courses"}
            </p>
          )}
          {role === "creator" && activeSection === "Courses" && (
            <p>Preview data · metrics are illustrative</p>
          )}
        </div>

        {role === "student" ? (
          <div
            className="enrollment-tabs"
            role="tablist"
            aria-label="Course enrollment"
          >
            {(
              [
                ["all", "All"],
                ["enrolled", "Enrolled"],
                ["not-enrolled", "Not Enrolled"],
              ] satisfies readonly (readonly [CourseEnrollmentFilter, string])[]
            ).map(([value, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={enrollmentFilter === value}
                tabIndex={enrollmentFilter === value ? 0 : -1}
                key={value}
                onClick={() => onEnrollmentFilterChange(value)}
                onKeyDown={handleRovingTabKeyDown}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="create-course"
            onClick={() => onNavigatePage("Create Course")}
          >
            <Plus size={21} /> Create Course
          </button>
        )}
      </div>

      <div className="courses-toolbar">
        <label className="courses-search">
          <MagnifyingGlass size={21} />
          <span className="sr-only">Search courses</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search your courses..."
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
            >
              <X size={16} />
            </button>
          )}
        </label>

        <div className="courses-toolbar__filters">
          <div className="course-select">
            <ArrowsDownUp size={20} />
            <ThemedSelect
              value={sort}
              onValueChange={onSortChange}
              ariaLabel="Sort courses"
              options={
                [
                  ["latest", "Sort by: Latest"],
                  ["title", "Sort by: Title"],
                  ["progress", "Sort by: Progress"],
                ] as const
              }
            />
          </div>
          <div className="course-select">
            <Funnel size={20} />
            <ThemedSelect
              value={category}
              onValueChange={onCategoryChange}
              ariaLabel="Filter by category"
              options={
                [
                  ["all", "All Categories"],
                  ["Design", "Design"],
                  ["Development", "Development"],
                  ["Database", "Database"],
                  ["Cloud", "Cloud"],
                ] as const
              }
            />
          </div>
        </div>
      </div>

      {visibleCourses.length ? (
        <section className="courses-grid" aria-label={activeSection}>
          {visibleCourses.map((course, index) => (
            <CourseCard
              key={course.id}
              course={course}
              role={role}
              wishlisted={wishlisted.has(course.id)}
              onWishlist={onWishlist}
              onOpen={onOpenCourse}
              onExplore={(selected) =>
                onNavigatePage(
                  `/explore-courses/${encodeURIComponent(selected.id)}/overview`,
                )
              }
              onEdit={(selected) => {
                if (onEditCourse) {
                  onEditCourse(selected);
                } else {
                  onNavigatePage(
                    `/courses/create?edit=${encodeURIComponent(selected.id)}`,
                  );
                }
              }}
              menuOpen={courseMenu === course.id}
              setMenuOpen={setCourseMenu}
              setNotice={setNotice}
              imagePriority={index === 0}
            />
          ))}
        </section>
      ) : (
        <div className="courses-empty">
          <Heart size={34} />
          <h2>
            {activeSection === "Wishlist"
              ? "Your wishlist is empty"
              : "No courses found"}
          </h2>
          <p>
            {activeSection === "Wishlist"
              ? "Save a course with its heart button and it will appear here."
              : "Try a different search or filter."}
          </p>
          <button type="button" onClick={onResetCatalogue}>
            View all courses
          </button>
        </div>
      )}
    </>
  );
}
