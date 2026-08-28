import { HeartIcon as Heart, PlusIcon as Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import { ExpandableSearch } from "../ExpandableSearch";
import { ThemedSelect } from "../ThemedSelect";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import { CourseCard } from "./CourseCard";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseOpenOptions,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "./catalogue";

export interface CourseCatalogueProps {
  activeSection: string;
  role: CourseRole;
  wishlisted: ReadonlySet<string>;
  enrollmentFilter: CourseEnrollmentFilter;
  onEnrollmentFilterChange: (filter: CourseEnrollmentFilter) => void;
  statusFilter: CourseStatusFilter;
  onStatusFilterChange: (filter: CourseStatusFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sort: CourseSort;
  onSortChange: (sort: CourseSort) => void;
  visibleCourses: readonly Course[];
  onWishlist: (courseId: string) => void;
  onOpenCourse: (course: Course, options?: CourseOpenOptions) => void;
  courseMenu: string | null;
  setCourseMenu: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  onNavigatePage: (destination: string) => void;
  onResetCatalogue: () => void;
  onDeleteCourse?: (course: Course) => Promise<void> | void;
}

export function CourseCatalogue({
  activeSection,
  role,
  wishlisted,
  enrollmentFilter,
  onEnrollmentFilterChange,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  visibleCourses,
  onWishlist,
  onOpenCourse,
  courseMenu,
  setCourseMenu,
  setNotice,
  onNavigatePage,
  onResetCatalogue,
  onDeleteCourse,
}: CourseCatalogueProps) {
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const quickFilters = (
    role === "creator"
      ? [
          ["all", "All"],
          ["published", "Published"],
          ["draft", "Draft"],
          ["archived", "Archived"],
        ]
      : [
          ["all", "All"],
          ["enrolled", "Enrolled"],
          ["not-enrolled", "Not Enrolled"],
        ]
  ) satisfies readonly (readonly [CourseEnrollmentFilter, string])[];

  const sortOptions = (
    role === "creator"
      ? [
          ["latest", "Recently Updated"],
          ["title", "A-Z"],
        ]
      : [
          ["latest", "Recently Accessed"],
          ["title", "A-Z"],
          ["progress", "Progress"],
        ]
  ) satisfies readonly (readonly [CourseSort, string])[];

  const statusOptions = [
    ["all", "Status: All"],
    ["in-progress", "In Progress"],
    ["not-started", "Not Started"],
    ["completed", "Completed"],
  ] satisfies readonly (readonly [CourseStatusFilter, string])[];

  const gridClasses =
    role === "creator"
      ? "grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3"
      : "grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  const renderCard = (course: Course, index: number) => (
    <CourseCard
      key={course.id}
      course={course}
      role={role}
      wishlisted={wishlisted.has(course.id)}
      onWishlist={onWishlist}
      onOpen={(selected) =>
        onOpenCourse(
          selected,
          role === "student" && !selected.enrolled
            ? { preview: true }
            : undefined,
        )
      }
      onExplore={(selected) =>
        onNavigatePage(`/courses/${encodeURIComponent(selected.id)}/overview`)
      }
      onEdit={(selected) =>
        onNavigatePage(
          `/courses/create?edit=${encodeURIComponent(selected.id)}`,
        )
      }
      onManage={(selected) =>
        onNavigatePage(
          `/courses/create?edit=${encodeURIComponent(selected.id)}&tab=curriculum`,
        )
      }
      onPublish={(selected) =>
        onNavigatePage(
          `/courses/create?edit=${encodeURIComponent(selected.id)}&tab=publish`,
        )
      }
      onDeleteRequested={setPendingDelete}
      onNavigatePage={onNavigatePage}
      menuOpen={courseMenu === course.id}
      setMenuOpen={setCourseMenu}
      setNotice={setNotice}
      imagePriority={index === 0}
    />
  );

  return (
    <section
      aria-label={activeSection}
      className="mx-auto w-full max-w-[1800px]"
    >
      <header className="relative flex flex-col gap-4 border-b border-(--border) pb-0 min-[640px]:pb-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-3">
        <ExpandableSearch
          inputId="courses-search-input"
          fieldId="courses-search"
          label="Search courses"
          placeholder="Search courses..."
          value={search}
          onValueChange={onSearchChange}
          open={mobileSearchOpen}
          onOpenChange={setMobileSearchOpen}
          persistentDesktop
          clearOnBack
        >
          <div className="min-w-0 min-[900px]:order-1 min-[900px]:flex-1">
            <h1 className="text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)">
              {activeSection}
            </h1>
            <p className="mt-1.5 hidden text-[0.88rem] leading-6 text-(--muted) min-[640px]:block">
              {activeSection === "Wishlist"
                ? `${wishlisted.size} saved ${wishlisted.size === 1 ? "course" : "courses"}.`
                : role === "creator"
                  ? "Manage, publish, and organize your courses."
                  : "Explore courses and continue where you left off."}
            </p>
          </div>

          {role === "creator" && activeSection === "Courses" && (
            <div className="order-3 flex shrink-0 items-center gap-2 min-[900px]:order-3">
              <button
                type="button"
                aria-label="Create"
                className="flex h-11 shrink-0 items-center gap-2 rounded-(--control-radius-action) border border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-(--accent) px-4 text-[14px]! font-[650]! text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-colors hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                data-control-radius-action
                onClick={() => onNavigatePage("Create Course")}
              >
                <Plus size={18} weight="bold" />
                <span>Create</span>
              </button>
            </div>
          )}
        </ExpandableSearch>
      </header>

      <div
        className="mt-2 flex flex-col gap-3 min-[640px]:mt-5 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between"
        data-courses-toolbar
      >
        <div className="min-w-0">
          <div
            className="inline-flex min-h-9 w-fit max-w-full gap-2 overflow-x-auto sm:min-h-10"
            role="tablist"
            aria-label={
              role === "creator" ? "Course lifecycle" : "Course enrollment"
            }
          >
            {quickFilters.map(([value, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={enrollmentFilter === value}
                tabIndex={enrollmentFilter === value ? 0 : -1}
                key={value}
                className="min-h-9 shrink-0 rounded-(--control-radius-structured) border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))] px-3.5 text-xs! leading-5! font-semibold text-(--text-secondary) shadow-[0_5px_14px_color-mix(in_srgb,var(--accent-shadow)_16%,transparent)] transition-[background-color,border-color,color,box-shadow] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-(--hover) hover:text-(--text) aria-selected:border-(--text) aria-selected:bg-(--text) aria-selected:text-(--canvas) aria-selected:shadow-[0_7px_18px_color-mix(in_srgb,var(--accent-shadow)_28%,transparent)] aria-selected:hover:bg-(--text) sm:min-h-9 sm:px-4 sm:text-[0.8rem]!"
                onClick={() => onEnrollmentFilterChange(value)}
                onKeyDown={handleRovingTabKeyDown}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden grid-cols-2 gap-3 min-[821px]:col-span-2 min-[821px]:grid min-[1080px]:flex min-[1080px]:shrink-0 min-[1080px]:gap-2.5">
          <ThemedSelect
            value={sort}
            onValueChange={onSortChange}
            ariaLabel="Sort courses"
            options={sortOptions}
            triggerClassName="h-11! w-full! min-w-0! rounded-(--control-radius-structured)! border! border-(--border)! bg-[color-mix(in_srgb,var(--surface)_76%,transparent)]! px-3! text-[0.78rem]! text-(--text-secondary)! min-[1080px]:h-10! min-[1080px]:w-42.5!"
          />
          {role === "student" && (
            <ThemedSelect
              value={statusFilter}
              onValueChange={onStatusFilterChange}
              ariaLabel="Filter course status"
              options={statusOptions}
              triggerClassName="h-11! w-full! min-w-0! rounded-(--control-radius-structured)! border! border-(--border)! bg-[color-mix(in_srgb,var(--surface)_76%,transparent)]! px-3! text-[0.78rem]! text-(--text-secondary)! min-[1080px]:h-10! min-[1080px]:w-35!"
            />
          )}
        </div>
      </div>

      {visibleCourses.length ? (
        <div className="mt-4 min-[640px]:mt-6" data-course-grid-section>
          <div className={gridClasses}>
            {visibleCourses.map((course, index) => renderCard(course, index))}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid min-h-90 place-items-center content-center rounded-xl border border-dashed border-(--border-strong) px-6 text-center">
          <Heart size={34} className="text-(--accent)" />
          <h2 className="mt-3 text-base font-semibold text-(--text)">
            {activeSection === "Wishlist"
              ? "Your wishlist is empty"
              : "No courses found"}
          </h2>
          <p className="mt-1.5 max-w-sm text-[0.82rem] leading-6 text-(--muted)">
            {activeSection === "Wishlist"
              ? "Save a not-enrolled course with its heart button and it will appear here."
              : "Try a different search or filter."}
          </p>
          <button
            type="button"
            className="mt-4 min-h-10 rounded-(--control-radius-action) bg-(--accent) px-4 text-[0.8rem] font-semibold text-(--on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            data-control-radius-action
            onClick={onResetCatalogue}
          >
            View all courses
          </button>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={pendingDelete !== null}
        title="Delete course?"
        message={
          pendingDelete
            ? `Delete “${pendingDelete.title}” and its course content? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete Course"
        holdDurationMs={900}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const target = pendingDelete;
          try {
            if (onDeleteCourse) {
              await onDeleteCourse(target);
            } else {
              setNotice(`${target.title} was deleted.`);
            }
          } catch {
            // Failure is handled by onDeleteCourse toast notification
          } finally {
            setPendingDelete(null);
          }
        }}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  );
}
