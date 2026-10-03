import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import { ExpandableSearch } from "../ExpandableSearch";
import { ThemedSelect } from "../ThemedSelect";
import { handleRovingTabKeyDown } from "../accessibility/rovingTabFocus";
import {
  CourseCard,
  courseThumbnailSizes,
  getCourseThumbnailSrcSet,
} from "./CourseCard";
import {
  CourseCatalogueLoadingSkeleton,
  getCourseCatalogueGridClasses,
} from "./CourseCatalogueSkeleton";
export { CourseCatalogueLoadingSkeleton } from "./CourseCatalogueSkeleton";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseOpenOptions,
  CourseQuickFilterCounts,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "./catalogue";
import { courseMatchesWishlist, getCourseRouteKey } from "./catalogue";

function useCourseCatalogueBreakpoint(query: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined") return () => undefined;
      const media = window.matchMedia(query);
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export interface CourseCatalogueProps {
  activeSection: string;
  role: CourseRole;
  wishlisted: ReadonlySet<string>;
  quickFilterCounts: CourseQuickFilterCounts;
  enrollmentFilter: CourseEnrollmentFilter;
  onEnrollmentFilterChange: (filter: CourseEnrollmentFilter) => void;
  statusFilter: CourseStatusFilter;
  onStatusFilterChange: (filter: CourseStatusFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sort: CourseSort;
  onSortChange: (sort: CourseSort) => void;
  visibleCourses: readonly Course[];
  totalCoursesCount?: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  onWishlist: (course: Course) => void;
  onOpenCourse: (course: Course, options?: CourseOpenOptions) => void;
  onEditIntent?: (course: Course) => void;
  courseMenu: string | null;
  setCourseMenu: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  onNavigatePage: (destination: string) => void;
  onResetCatalogue: () => void;
  isAdmin?: boolean;
  currentUserId?: string;
  isLoading?: boolean;
  hasLoadError?: boolean;
  onRetryLoad?: () => void;
  preloadFirstCourseImage?: boolean;
  onDeleteCourse?: (course: Course) => Promise<void> | void;
  onRestoreCourse?: (course: Course) => Promise<void> | void;
  deletingCourseIds?: ReadonlySet<string>;
}

export function CourseCatalogue({
  activeSection,
  role,
  isAdmin = false,
  currentUserId,
  isLoading = false,
  hasLoadError = false,
  onRetryLoad,
  preloadFirstCourseImage = false,
  wishlisted,
  quickFilterCounts,
  enrollmentFilter,
  onEnrollmentFilterChange,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  visibleCourses,
  totalCoursesCount,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  onWishlist,
  onOpenCourse,
  onEditIntent,
  courseMenu,
  setCourseMenu,
  setNotice,
  onNavigatePage,
  onResetCatalogue,
  onDeleteCourse,
  onRestoreCourse,
  deletingCourseIds,
}: CourseCatalogueProps) {
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null);
  const [localDeletingIds, setLocalDeletingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mediumBreakpoint = useCourseCatalogueBreakpoint("(min-width: 640px)");
  const wideControlsBreakpoint =
    useCourseCatalogueBreakpoint("(min-width: 821px)");
  const desktopLayout = useCourseCatalogueBreakpoint("(min-width: 900px)");
  const mediumLayout = mediumBreakpoint || desktopLayout;
  const wideControlsLayout = wideControlsBreakpoint || desktopLayout;

  const isFiltered =
    Boolean(search.trim()) ||
    enrollmentFilter !== "all" ||
    statusFilter !== "all";
  const hasCourses =
    totalCoursesCount !== undefined
      ? totalCoursesCount > 0 || isFiltered
      : isFiltered;

  const isCourseDeleting = (courseId: string) =>
    Boolean(deletingCourseIds?.has(courseId) || localDeletingIds.has(courseId));

  const quickFilters = (
    role === "creator"
      ? [
          ["all", "All"],
          ["published", "Published"],
          ["draft", "Draft"],
          ...(isAdmin ? [["bin", "Bin"] as const] : []),
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

  const gridClasses = getCourseCatalogueGridClasses(role);

  const filterCountFor = (value: CourseEnrollmentFilter) => {
    if (value === "all") return quickFilterCounts.all;
    if (value === "enrolled") return quickFilterCounts.enrolled;
    if (value === "not-enrolled") return quickFilterCounts["not-enrolled"];
    if (value === "published") return quickFilterCounts.published;
    if (value === "draft") return quickFilterCounts.draft;
    if (value === "bin") return quickFilterCounts.bin;
    return 0;
  };

  const quickFilterTabClassName =
    "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-(--control-radius-structured) border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))] px-3.5 text-xs! leading-5! font-semibold max-[640px]:font-semibold! text-(--text-secondary) shadow-[0_5px_14px_color-mix(in_srgb,var(--accent-shadow)_16%,transparent)] transition-[background-color,border-color,color,box-shadow] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-(--hover) hover:text-(--text) aria-selected:border-[color-mix(in_srgb,var(--accent)_70%,transparent)] aria-selected:bg-(--accent) aria-selected:text-(--on-accent) aria-selected:shadow-[0_7px_18px_color-mix(in_srgb,var(--accent-shadow)_45%,transparent)] aria-selected:hover:bg-(--accent-hover) sm:min-h-9 sm:px-4 sm:text-[0.8rem]!";
  const quickFilterCountClassName = (active: boolean) =>
    [
      "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 text-[0.625rem]! leading-none font-bold tabular-nums",
      active
        ? "border-[color-mix(in_srgb,var(--on-accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--on-accent)_16%,transparent)] text-(--on-accent)"
        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] text-(--text-secondary)",
    ].join(" ");

  const firstImageIndex = visibleCourses.findIndex((course) =>
    Boolean(course.thumbnail),
  );
  const firstImageCourse =
    firstImageIndex >= 0 ? visibleCourses[firstImageIndex] : undefined;
  const priorityImageIndexes = new Set<number>();
  for (
    let index = firstImageIndex;
    index >= 0 &&
    index < visibleCourses.length &&
    priorityImageIndexes.size < 2;
    index += 1
  ) {
    if (visibleCourses[index]?.thumbnail) priorityImageIndexes.add(index);
  }

  const renderCard = (course: Course, isPriorityImage: boolean) => (
    <CourseCard
      key={course.id}
      course={course}
      role={role}
      isAdmin={isAdmin}
      currentUserId={currentUserId}
      wishlisted={courseMatchesWishlist(course, wishlisted)}
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
        onNavigatePage(
          `/courses/${encodeURIComponent(getCourseRouteKey(selected))}/overview`,
        )
      }
      onEdit={(selected) => {
        onEditIntent?.(selected);
        onNavigatePage(
          `/courses/${encodeURIComponent(selected.id)}/edit/basics`,
        );
      }}
      onEditIntent={onEditIntent}
      onManage={(selected) => {
        onEditIntent?.(selected);
        onNavigatePage(
          `/courses/${encodeURIComponent(selected.id)}/edit/curriculum`,
        );
      }}
      onPublish={(selected) => {
        onEditIntent?.(selected);
        onNavigatePage(
          `/courses/${encodeURIComponent(selected.id)}/edit/publish`,
        );
      }}
      onDeleteRequested={setPendingDelete}
      onRestoreRequested={onRestoreCourse}
      onNavigatePage={onNavigatePage}
      menuOpen={courseMenu === course.id}
      setMenuOpen={setCourseMenu}
      setNotice={setNotice}
      imagePriority={isPriorityImage}
      isBin={enrollmentFilter === "bin"}
      isDeleting={isCourseDeleting(course.id)}
    />
  );

  return (
    <section
      aria-label={activeSection}
      className="mx-auto w-full max-w-[1800px]"
    >
      {preloadFirstCourseImage && firstImageCourse?.thumbnail ? (
        <link
          rel="preload"
          as="image"
          href={firstImageCourse.thumbnail}
          imageSrcSet={getCourseThumbnailSrcSet(firstImageCourse)}
          imageSizes={courseThumbnailSizes}
          fetchPriority="high"
        />
      ) : null}
      <header
        className={`relative flex ${desktopLayout ? "flex-row items-center gap-3" : "flex-col gap-4"} border-b border-(--border) ${mediumLayout ? "pb-4" : "pb-0"} max-[640px]:px-(--application-page-inline-gutter) min-[640px]:pb-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-3`}
      >
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
          forcePersistentDesktop={desktopLayout}
          clearOnBack
        >
          <div
            className={`min-w-0 ${desktopLayout ? "order-1 flex-1" : ""} min-[900px]:order-1 min-[900px]:flex-1`}
          >
            <h1 className="text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)">
              {activeSection}
            </h1>
            <p
              className={`mt-1.5 text-[0.88rem] leading-6 text-(--muted) ${mediumLayout ? "block" : "hidden"} min-[640px]:block`}
            >
              {role === "creator"
                ? "Manage, publish, and organize your courses."
                : "Explore courses and continue where you left off."}
            </p>
          </div>

          {role === "creator" && activeSection === "Courses" && (
            <div className="order-3 flex shrink-0 items-center gap-2">
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
        className={`mt-2 flex flex-col gap-3 ${mediumLayout ? "mt-5 flex-row items-center justify-between" : ""} max-[640px]:px-(--application-page-inline-gutter) min-[640px]:mt-5 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between`}
        data-courses-toolbar
        style={
          mediumLayout
            ? {
                display: "grid",
                gridTemplateColumns: wideControlsLayout
                  ? "minmax(0, 1fr) auto"
                  : "minmax(0, 1fr)",
                alignItems: "center",
              }
            : undefined
        }
      >
        <div className="min-w-0 text-left">
          <div
            className="inline-flex min-h-9 w-fit max-w-full gap-2 overflow-x-auto max-[640px]:-mx-(--application-page-inline-gutter) max-[640px]:w-[calc(100%+var(--application-page-inline-gutter)+var(--application-page-inline-gutter))]! max-[640px]:max-w-none! max-[640px]:px-(--application-page-inline-gutter) min-[641px]:-ml-(--application-page-inline-gutter) min-[641px]:pl-(--application-page-inline-gutter) sm:min-h-10"
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
                className={quickFilterTabClassName}
                onClick={() => onEnrollmentFilterChange(value)}
                onKeyDown={handleRovingTabKeyDown}
              >
                <span>{label}</span>
                <span
                  className={quickFilterCountClassName(
                    enrollmentFilter === value,
                  )}
                >
                  {filterCountFor(value)}
                </span>
              </button>
            ))}
            {role === "student" ? (
              <button
                type="button"
                role="tab"
                aria-selected={enrollmentFilter === "wishlist"}
                tabIndex={enrollmentFilter === "wishlist" ? 0 : -1}
                className={quickFilterTabClassName}
                aria-label={`Wishlisted, ${quickFilterCounts.wishlist} saved`}
                onClick={() => onEnrollmentFilterChange("wishlist")}
                onKeyDown={handleRovingTabKeyDown}
              >
                <Heart
                  size={16}
                  weight={enrollmentFilter === "wishlist" ? "fill" : "regular"}
                  className={
                    enrollmentFilter === "wishlist"
                      ? "text-[#d12d52]"
                      : "text-[#ff6684]"
                  }
                  aria-hidden
                />
                <span>Wishlisted</span>
                <span
                  className={quickFilterCountClassName(
                    enrollmentFilter === "wishlist",
                  )}
                >
                  {quickFilterCounts.wishlist}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={`${wideControlsLayout ? "flex shrink-0 items-center gap-2.5" : "hidden"} min-[821px]:flex min-[821px]:shrink-0 min-[821px]:items-center min-[821px]:gap-2.5`}
        >
          <ThemedSelect
            value={sort}
            onValueChange={onSortChange}
            ariaLabel="Sort courses"
            options={sortOptions}
            triggerClassName="h-10! w-42.5! rounded-(--control-radius-structured)! border! border-(--border)! bg-[color-mix(in_srgb,var(--surface)_76%,transparent)]! px-3! text-[0.78rem]! text-(--text-secondary)!"
          />
          {role === "student" && (
            <ThemedSelect
              value={statusFilter}
              onValueChange={onStatusFilterChange}
              ariaLabel="Filter course status"
              options={statusOptions}
              triggerClassName="h-10! w-35! rounded-(--control-radius-structured)! border! border-(--border)! bg-[color-mix(in_srgb,var(--surface)_76%,transparent)]! px-3! text-[0.78rem]! text-(--text-secondary)!"
            />
          )}
        </div>
      </div>

      {isLoading ? (
        <CourseCatalogueLoadingSkeleton role={role} />
      ) : hasLoadError ? (
        <div
          className="mt-6 grid min-h-90 place-items-center rounded-xl border border-dashed border-(--border-strong) px-6 text-center"
          role="alert"
        >
          <div>
            <h2 className="text-base font-semibold text-(--text)">
              Courses couldn’t load
            </h2>
            <p className="mt-1.5 max-w-sm text-[0.82rem] leading-6 text-(--muted)">
              Check your connection and try again.
            </p>
            {onRetryLoad ? (
              <button
                type="button"
                className="mt-4 min-h-10 rounded-(--control-radius-action) bg-(--accent) px-4 text-[0.8rem] font-semibold text-(--on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                onClick={onRetryLoad}
              >
                Retry
              </button>
            ) : null}
          </div>
        </div>
      ) : visibleCourses.length ? (
        <div
          className="mt-4 min-[640px]:mt-6"
          data-course-grid-section
          data-course-catalogue-grid
          suppressHydrationWarning
        >
          <div className={gridClasses}>
            {visibleCourses.map((course, index) =>
              renderCard(course, priorityImageIndexes.has(index)),
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid min-h-90 place-items-center content-center rounded-xl border border-dashed border-(--border-strong) px-6 text-center">
          <Heart size={34} className="text-(--accent)" />
          <h2 className="mt-3 text-base font-semibold text-(--text)">
            {enrollmentFilter === "wishlist" && quickFilterCounts.wishlist === 0
              ? "Your wishlist is empty"
              : hasCourses
                ? "No courses found"
                : "No courses yet"}
          </h2>
          <p className="mt-1.5 max-w-sm text-[0.82rem] leading-6 text-(--muted)">
            {enrollmentFilter === "wishlist" && quickFilterCounts.wishlist === 0
              ? "Save a course with its heart button and it will appear here."
              : hasCourses
                ? "Try a different search or filter."
                : role === "creator"
                  ? "You haven't created any courses yet. Create your first course to get started."
                  : "You don't have any courses available to you yet."}
          </p>
          {hasCourses || enrollmentFilter === "wishlist" ? (
            <button
              type="button"
              className="mt-4 min-h-10 rounded-(--control-radius-action) bg-(--accent) px-4 text-[0.8rem] font-semibold text-(--on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              data-control-radius-action
              onClick={onResetCatalogue}
            >
              View all courses
            </button>
          ) : role === "creator" ? (
            <button
              type="button"
              className="mt-4 min-h-10 rounded-(--control-radius-action) bg-(--accent) px-4 text-[0.8rem] font-semibold text-(--on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              data-control-radius-action
              onClick={() => onNavigatePage("Create Course")}
            >
              Create course
            </button>
          ) : null}
        </div>
      )}

      {hasNextPage && onLoadMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-(--control-radius-action) border border-(--border-strong) bg-(--card-surface) px-4 text-[0.8rem] font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-wait disabled:opacity-60"
            onClick={onLoadMore}
            aria-busy={isFetchingNextPage}
            aria-label={isFetchingNextPage ? "Loading more courses" : undefined}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <CircleNotch
                size={16}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {isFetchingNextPage ? null : "Load more courses"}
          </button>
        </div>
      ) : null}

      <ConfirmDeleteModal
        isOpen={pendingDelete !== null}
        title="Move course to Bin?"
        message={
          pendingDelete
            ? `Move “${pendingDelete.title}” to the Bin? You can restore it later.`
            : undefined
        }
        confirmLabel="Move to Bin"
        holdDurationMs={900}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const target = pendingDelete;
          setLocalDeletingIds((prev) => new Set(prev).add(target.id));
          try {
            if (onDeleteCourse) {
              await onDeleteCourse(target);
            } else {
              setNotice(`${target.title} moved to Bin.`);
            }
          } catch {
            // Failure is handled by onDeleteCourse toast notification
          } finally {
            setLocalDeletingIds((prev) => {
              const next = new Set(prev);
              next.delete(target.id);
              return next;
            });
            setPendingDelete(null);
          }
        }}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  );
}
