import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import {
  CourseCatalogueEmptyState,
  isLoginPromptFilter,
} from "./CourseCatalogueEmptyState";
import { ExpandableSearch } from "../ExpandableSearch";
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
import { courseSurfaceElevation } from "../components/cardElevation";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization/authorization.queries";
import { hasAdminRole } from "../shell/workspaceRole";
import { courseMatchesWishlist, getCourseRouteKey } from "./catalogue";
import { useCatalogSearchTracking } from "./useCatalogSearchTracking";
import { ShownCourseThumbnailsScript } from "./CourseCardThumbnail";

// Only a learner leaving a free course needs this, so it stays out of the
// catalogue's own code.
const UnenrollCourseModal = lazy(() =>
  import("./UnenrollCourseModal").then((module) => ({
    default: module.UnenrollCourseModal,
  })),
);

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
  onStatusFilterChange?: (filter: CourseStatusFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** The page still holds an order; the catalogue no longer offers to change it. */
  sort?: CourseSort;
  onSortChange?: (sort: CourseSort) => void;
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
  /** The session has been checked and nobody is signed in. */
  signedOut?: boolean;
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
  signedOut = false,
  isLoading = false,
  hasLoadError = false,
  onRetryLoad,
  preloadFirstCourseImage = false,
  wishlisted,
  quickFilterCounts,
  enrollmentFilter,
  onEnrollmentFilterChange,
  statusFilter,
  search,
  onSearchChange,
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
  const capabilities = useCapabilities({ enabled: role === "creator" });
  const canCreateCourse = capabilities.can("course.create");
  // The bin lists every deleted course, so it takes the academy-wide key.
  const canOpenBin =
    isAdmin || capabilities.canOnCourse("course.restore", null);
  useCatalogSearchTracking(
    search,
    isLoading,
    totalCoursesCount ?? visibleCourses.length,
  );
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null);
  const [pendingUnenroll, setPendingUnenroll] = useState<Course | null>(null);
  // An admin in Student view can leave any course they enrolled in, and
  // doing so clears their progress in it.
  const accountIsAdmin = hasAdminRole(useCurrentUser().data?.roles);
  const quickFilterTabsRef = useRef<HTMLDivElement>(null);
  const [hasQuickFilterOverflow, setHasQuickFilterOverflow] = useState(false);
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
          ...(canOpenBin ? [["bin", "Bin"] as const] : []),
        ]
      : [
          ["all", "All"],
          ["enrolled", "Enrolled"],
          ["not-enrolled", "Not Enrolled"],
          ["free", "Free"],
        ]
  ) satisfies readonly (readonly [CourseEnrollmentFilter, string])[];

  useEffect(() => {
    const tabs = quickFilterTabsRef.current;
    if (!tabs) return;

    const updateOverflow = () => {
      setHasQuickFilterOverflow(
        tabs.scrollWidth > tabs.clientWidth + 1 &&
          tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1,
      );
    };

    updateOverflow();
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(tabs);
    for (const child of tabs.children) {
      resizeObserver.observe(child);
    }
    tabs.addEventListener("scroll", updateOverflow, { passive: true });

    return () => {
      resizeObserver.disconnect();
      tabs.removeEventListener("scroll", updateOverflow);
    };
  }, [quickFilters.length]);

  const gridClasses = getCourseCatalogueGridClasses(role);

  const filterCountFor = (value: CourseEnrollmentFilter) => {
    if (value === "all") return quickFilterCounts.all;
    if (value === "enrolled") return quickFilterCounts.enrolled;
    if (value === "not-enrolled") return quickFilterCounts["not-enrolled"];
    if (value === "free") return quickFilterCounts.free;
    if (value === "published") return quickFilterCounts.published;
    if (value === "draft") return quickFilterCounts.draft;
    if (value === "bin") return quickFilterCounts.bin;
    return 0;
  };

  // By day the search field is raised like the sidebar's selected menu item
  // (its fill, its shadow, no outline), as the course cards are. It belongs
  // to a shared component, so it is styled from here; it keeps its accent
  // outline while it is being typed in.
  const raisedSearchField =
    "[:root[data-theme=light]:not([data-elevated-surfaces=false])_&_[data-expandable-search-field]:not(:focus-within)]:border-transparent [:root[data-theme=light]:not([data-elevated-surfaces=false])_&_[data-expandable-search-field]:not(:focus-within)]:bg-(image:--raised-surface-image) [:root[data-theme=light]:not([data-elevated-surfaces=false])_&_[data-expandable-search-field]:not(:focus-within)]:shadow-(--sidebar-menu-active-shadow)";

  // The filter chips are coloured from the theme in both light and dark:
  // resting chips take a light tint of the accent, with no outline, and the
  // selected one is filled with the accent and lifted by a soft shadow of
  // the same colour, with no edge lines. Its shadow is kept short, because
  // the chip row clips anything that reaches far past it. The accent is laid
  // on as an image, and under it the selected chip keeps the resting tint;
  // only the hover fill is animated, so a chip that loses the selection takes
  // its resting look at once instead of fading.
  const quickFilterTabClassName =
    "group/quick-filter relative inline-flex min-h-9 shrink-0 items-center gap-2 rounded-(--control-radius-structured) border border-[color-mix(in_srgb,var(--text)_12%,transparent)] [--quick-filter-fill:color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-(--quick-filter-fill) px-3.5 text-xs! leading-5! font-semibold max-[640px]:font-semibold! text-(--text) shadow-[0_5px_14px_color-mix(in_srgb,var(--accent-shadow)_16%,transparent)] transition-[background-color,border-color,color,box-shadow] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_24%,var(--surface))] hover:text-(--text) aria-selected:border-[color-mix(in_srgb,var(--accent)_70%,transparent)] aria-selected:bg-(--accent) aria-selected:text-(--on-accent) aria-selected:shadow-[0_4px_11px_color-mix(in_srgb,var(--accent-shadow)_40%,transparent)] aria-selected:hover:bg-(--accent-hover) sm:min-h-9 sm:px-4 sm:text-[0.8rem]! [:root:not([data-elevated-surfaces=false])_&]:border-transparent [:root:not([data-elevated-surfaces=false])_&:not([aria-selected=true])]:shadow-none [:root:not([data-elevated-surfaces=false])_&[aria-selected=true]]:bg-[linear-gradient(var(--accent),var(--accent))] [:root:not([data-elevated-surfaces=false])_&[aria-selected=true]]:bg-(--quick-filter-fill) [:root:not([data-elevated-surfaces=false])_&]:transition-[background-color] [:root[data-theme=light]:not([data-elevated-surfaces=false])_&[aria-selected=true]]:shadow-[0_1px_3px_color-mix(in_srgb,var(--accent)_28%,transparent),0_5px_14px_color-mix(in_srgb,var(--accent)_32%,transparent)] [:root[data-theme=dark]:not([data-elevated-surfaces=false])_&[aria-selected=true]]:shadow-[0_1px_3px_rgb(0_0_0/35%),0_5px_14px_color-mix(in_srgb,var(--accent)_30%,transparent)]";
  // A chip's count is not drawn inside it (a boxed number reads as a keyboard
  // shortcut there). It stays in the chip's text for screen readers and
  // shows only while the chip is hovered or focused from the keyboard, as a
  // notification badge on its top-right corner. Touch screens cannot hover,
  // so there the selected chip always shows its count. On the selected chip
  // the badge swaps its colours so it stands apart from the accent fill.
  const quickFilterCountClassName =
    "pointer-events-none absolute -top-1.5 -right-1.5 z-1 inline-flex h-4 min-w-4 scale-75 items-center justify-center rounded-full bg-(--accent) px-[3px] text-[0.625rem]! leading-none font-bold tabular-nums text-(--on-accent) opacity-0 transition-[opacity,scale] duration-150 ease-out group-hover/quick-filter:scale-100 group-hover/quick-filter:opacity-100 group-focus-visible/quick-filter:scale-100 group-focus-visible/quick-filter:opacity-100 motion-reduce:transition-none group-aria-selected/quick-filter:bg-(--on-accent) group-aria-selected/quick-filter:text-(--accent) [@media(hover:none)]:group-aria-selected/quick-filter:scale-100 [@media(hover:none)]:group-aria-selected/quick-filter:opacity-100";

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
      wishlisted={courseMatchesWishlist(course, wishlisted)}
      onWishlist={onWishlist}
      onOpen={(selected, options) =>
        onOpenCourse(selected, {
          ...(role === "student" && !selected.enrolled
            ? { preview: true }
            : {}),
          ...options,
        })
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
      onUnenrollRequested={role === "student" ? setPendingUnenroll : undefined}
      canUnenrollFromAnyCourse={accountIsAdmin}
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
      className={`mx-auto w-full max-w-[1800px] ${courseSurfaceElevation} ${raisedSearchField}`}
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
        className={`relative flex ${desktopLayout ? "flex-row items-center gap-3" : "flex-col gap-4"} border-b border-(--border) ${mediumLayout ? "pb-4" : "pb-0"} max-[640px]:border-b-0 max-[640px]:px-(--application-page-inline-gutter) min-[640px]:pb-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-3`}
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

          {role === "creator" &&
            activeSection === "Courses" &&
            canCreateCourse && (
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
          {/* The row scrolls sideways, which clips anything outside it, so it
              gets room above and below for the chips' shadows, and on the
              right for the last chip's count badge; the negative margins
              keep the chips where they were. */}
          <div
            ref={quickFilterTabsRef}
            className="inline-flex min-h-9 w-fit max-w-full gap-2 overflow-x-auto -mt-3 -mb-6 pt-3 pb-6 min-[641px]:pr-2 max-[640px]:-mx-(--application-page-inline-gutter) max-[640px]:w-[calc(100%+var(--application-page-inline-gutter)+var(--application-page-inline-gutter))]! max-[640px]:max-w-none! max-[640px]:px-(--application-page-inline-gutter) min-[641px]:-ml-(--application-page-inline-gutter) min-[641px]:pl-(--application-page-inline-gutter) min-[821px]:w-[calc(100%_+_var(--application-page-inline-gutter))]! min-[821px]:max-w-none! sm:min-h-10"
            role="tablist"
            data-course-quick-filters
            data-fade-right={hasQuickFilterOverflow ? "true" : undefined}
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
                <span className={quickFilterCountClassName}>
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
                <span className={quickFilterCountClassName}>
                  {quickFilterCounts.wishlist}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isLoading ? (
        <CourseCatalogueLoadingSkeleton role={role} />
      ) : hasLoadError ? (
        <div
          className="mt-6 grid min-h-90 place-items-center px-6 text-center"
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
      ) : visibleCourses.length &&
        !isLoginPromptFilter(enrollmentFilter, role, signedOut) ? (
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
          <ShownCourseThumbnailsScript />
        </div>
      ) : (
        <CourseCatalogueEmptyState
          enrollmentFilter={enrollmentFilter}
          search={search}
          role={role}
          signedOut={signedOut}
          hasCourses={(totalCoursesCount ?? 0) > 0}
          onResetCatalogue={onResetCatalogue}
          onEnrollmentFilterChange={onEnrollmentFilterChange}
          onNavigatePage={onNavigatePage}
        />
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
      {pendingUnenroll ? (
        <Suspense fallback={null}>
          <UnenrollCourseModal
            course={pendingUnenroll}
            resetsProgress={accountIsAdmin}
            onClose={() => setPendingUnenroll(null)}
            setNotice={setNotice}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
