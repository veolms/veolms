import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/TrendUp";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { NavigateTo } from "../routing/navigation";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounceValue } from "../hooks/useDebounce";
import { useCourseOptions } from "../services/courses";
import { useStudents } from "../services/students";
import { StudentsTable } from "./StudentsTable";
import { StudentFiltersBar } from "./StudentFiltersBar";
import { StudentsTableSkeleton } from "./StudentsTableSkeleton";

export interface StudentsPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export function StudentsPage({ onNavigatePage, setNotice }: StudentsPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, searchControls] = useDebounceValue(
    searchQuery.trim(),
    DEFAULT_DEBOUNCE_DELAY_MS,
  );
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "inactive">(
    "all",
  );
  const [sortBy, setSortBy] = useState<"recent" | "name" | "courses" | "progress">("recent");
  const [isCourseFilterOpen, setIsCourseFilterOpen] = useState(false);

  // Load academy courses for the course filter dropdown
  const { data: coursesData } = useCourseOptions({
    enabled: isCourseFilterOpen,
  });
  const courseRecords = coursesData?.courses;
  const availableCourses = useMemo(() => {
    if (!courseRecords) return [];
    return courseRecords.map(({ id, title }) => ({ id, title }));
  }, [courseRecords]);

  const cleanSearch = debouncedSearch.replace(/^@+/, "").trim();

  // Infinite query for students
  const queryFilter = useMemo(
    () => ({
      search: cleanSearch || undefined,
      courseId: courseFilter !== "all" ? courseFilter : undefined,
      status: statusFilter,
      sortBy,
      limit: 50,
    }),
    [cleanSearch, courseFilter, statusFilter, sortBy],
  );

  const {
    data,
    isLoading,
    isError,
    hasNextPage = false,
    isFetchingNextPage,
    isFetching,
    isPlaceholderData,
    fetchNextPage,
    refetch,
  } = useStudents(queryFilter);

  // Keyboard shortcut listener (/ or Cmd+K to search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (!isInput) {
        if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
          e.preventDefault();
          document.getElementById("students-search-input")?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const students = useMemo(() => {
    return data?.pages.flatMap((page) => page.students) || [];
  }, [data?.pages]);

  const totalCount = data?.pages[0]?.totalCount ?? students.length;

  // Compute aggregate metrics from loaded students
  const metrics = useMemo(() => {
    const activeLearnersCount = students.filter((s) => s.enrolledCoursesCount > 0).length;
    const totalEnrollmentsCount = students.reduce((acc, s) => acc + s.enrolledCoursesCount, 0);
    const avgProgress =
      students.length > 0
        ? Math.round(
            students.reduce((acc, s) => acc + s.averageProgressPercent, 0) / students.length,
          )
        : 0;

    return {
      activeLearnersCount,
      totalEnrollmentsCount,
      avgProgress,
    };
  }, [students]);

  const resetFilters = () => {
    setSearchQuery("");
    searchControls.setValueImmediately("");
    setCourseFilter("all");
    setStatusFilter("all");
    setSortBy("recent");
  };

  return (
    <div className="flex w-full min-w-0 flex-col font-sans" aria-labelledby="students-page-title">
      {/* Top Header Row with Title, Description, and Header Icon Badge */}
      <header className="mb-6 flex items-start justify-between gap-5">
        <div>
          <h1
            id="students-page-title"
            className="text-[clamp(1.8rem,2.4vw,2.15rem)] leading-tight font-bold tracking-[-0.035em] text-(--text)"
          >
            Students
          </h1>
          <p className="mt-1.5 text-[0.88rem] leading-6 text-(--muted)">
            Review learners, access, and progress across your academy.
          </p>
        </div>

        <span
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--accent)/12 text-(--accent) sm:h-14 sm:w-14"
          aria-hidden="true"
        >
          <Users size={26} weight="duotone" />
        </span>
      </header>

      {/* Key Stats Summary Banner */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-4">
        {/* Card 1: Total Learners */}
        <div
          className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-5"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
              Total Learners
            </p>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent) sm:size-8">
              <Users size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
            {totalCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-(--muted)">Academy learners</p>
        </div>

        {/* Card 2: Active Learners */}
        <div
          className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-5"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
              Active Learners
            </p>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500 sm:size-8">
              <Sparkle size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
            {metrics.activeLearnersCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-(--muted)">Enrolled in courses</p>
        </div>

        {/* Card 3: Total Enrollments */}
        <div
          className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-5"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
              Total Enrollments
            </p>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent) sm:size-8">
              <GraduationCap size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
            {metrics.totalEnrollmentsCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-(--muted)">Course enrollments</p>
        </div>

        {/* Card 4: Avg Completion */}
        <div
          className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-5"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
              Avg Completion
            </p>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500 sm:size-8">
              <TrendUp size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
            {metrics.avgProgress}%
          </p>
          <p className="mt-1 text-xs text-(--muted)">Overall learning rate</p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="mb-6">
        <StudentFiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          courseFilter={courseFilter}
          onCourseFilterChange={setCourseFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          availableCourses={availableCourses}
          onCourseFilterOpen={() => setIsCourseFilterOpen(true)}
          onCourseFilterClose={() => setIsCourseFilterOpen(false)}
          onResetFilters={resetFilters}
        />
      </div>

      {/* Main Student List Area */}
      <main className="w-full min-w-0" aria-label="Students List">
        {isLoading ? (
          <StudentsTableSkeleton />
        ) : isError ? (
          // Error State
          <div
            className="flex flex-col items-center justify-center rounded-[18px] border border-(--border) bg-(--card-surface) p-12 text-center"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <WarningCircle size={36} className="mb-3 text-rose-400" />
            <h3 className="text-base font-semibold text-(--text)">Unable to load students</h3>
            <p className="mt-1 max-w-sm text-xs text-(--muted)">
              An error occurred while fetching the learners list. Please check your connection and
              try again.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90"
            >
              <ArrowCounterClockwise size={14} />
              <span>Retry</span>
            </button>
          </div>
        ) : students.length > 0 ? (
          // Modern ProCodrr Students Table
          <StudentsTable
            students={students}
            totalCount={totalCount}
            isLoading={isLoading}
            isTransitioning={isPlaceholderData || (isFetching && !isFetchingNextPage)}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
          />
        ) : (
          // Empty State
          <div
            className="flex flex-col items-center justify-center rounded-[18px] border border-(--border) bg-(--card-surface) p-12 text-center"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--hover) text-(--muted)">
              <Users size={28} weight="duotone" />
            </div>
            <h3 className="text-base font-semibold text-(--text)">No students found</h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-(--muted) md:text-sm">
              {searchQuery || courseFilter !== "all" || statusFilter !== "all"
                ? "No learners match your current search query or active filters. Try adjusting your filters or search terms."
                : "There are no students registered in your academy yet."}
            </p>
            {(searchQuery || courseFilter !== "all" || statusFilter !== "all") && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90"
              >
                <ArrowCounterClockwise size={14} />
                <span>Reset filters</span>
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
