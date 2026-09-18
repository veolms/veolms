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
import {
  DEFAULT_DEBOUNCE_DELAY_MS,
  useDebounceValue,
} from "../hooks/useDebounce";
import { useCourses } from "../services/courses";
import { useStudents } from "../services/students";
import { StudentsTable } from "./StudentsTable";
import { StudentFiltersBar } from "./StudentFiltersBar";

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
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "completed" | "inactive"
  >("all");
  const [sortBy, setSortBy] = useState<
    "recent" | "name" | "courses" | "progress"
  >("recent");

  // Load academy courses for the course filter dropdown
  const { data: coursesData } = useCourses();
  const courseRecords = coursesData?.courses;
  const availableCourses = useMemo(() => {
    if (!courseRecords) return [];
    return courseRecords.map((c) => ({
      id: c.id,
      title: c.title,
    }));
  }, [courseRecords]);

  // Infinite query for students
  const queryFilter = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      courseId: courseFilter !== "all" ? courseFilter : undefined,
      status: statusFilter,
      sortBy,
      limit: 50,
    }),
    [debouncedSearch, courseFilter, statusFilter, sortBy],
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
    const activeLearnersCount = students.filter(
      (s) => s.enrolledCoursesCount > 0,
    ).length;
    const totalEnrollmentsCount = students.reduce(
      (acc, s) => acc + s.enrolledCoursesCount,
      0,
    );
    const avgProgress =
      students.length > 0
        ? Math.round(
            students.reduce((acc, s) => acc + s.averageProgressPercent, 0) /
              students.length,
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
    <div
      className="w-full min-w-0 flex flex-col font-sans"
      aria-labelledby="students-page-title"
    >
      {/* Top Header Row with Title, Description, and Header Icon Badge */}
      <header className="flex items-start justify-between gap-5 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-(--accent)">
              Instructor Workspace
            </span>
          </div>
          <h1
            id="students-page-title"
            className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-[740] tracking-[-0.055em] leading-[1.02] text-(--text) mt-1"
          >
            Students
          </h1>
          <p className="mt-2 text-[0.92rem] text-(--muted) leading-normal">
            Review learners, access, and progress across your academy.
          </p>
        </div>

        <span
          className="inline-flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-(--accent)/12 text-(--accent)"
          aria-hidden="true"
        >
          <Users size={26} weight="duotone" />
        </span>
      </header>

      {/* Key Stats Summary Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5 mb-6">
        {/* Card 1: Total Learners */}
        <div
          className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
              Total Learners
            </p>
            <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
              <Users size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
            {totalCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-(--muted)">Academy learners</p>
        </div>

        {/* Card 2: Active Learners */}
        <div
          className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
              Active Learners
            </p>
            <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500">
              <Sparkle size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
            {metrics.activeLearnersCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-(--muted)">Enrolled in courses</p>
        </div>

        {/* Card 3: Total Enrollments */}
        <div
          className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
              Total Enrollments
            </p>
            <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
              <GraduationCap size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
            {metrics.totalEnrollmentsCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-(--muted)">Course enrollments</p>
        </div>

        {/* Card 4: Avg Completion */}
        <div
          className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
              Avg Completion
            </p>
            <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500">
              <TrendUp size={18} weight="duotone" />
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
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
          onResetFilters={resetFilters}
        />
      </div>

      {/* Main Student List Area */}
      <main className="w-full min-w-0" aria-label="Students List">
        {isLoading ? (
          // Table Skeleton during initial load
          <div
            className="rounded-[18px] border border-(--border) bg-(--card-surface-raised,var(--surface)) overflow-hidden animate-pulse"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div className="h-11 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)]" />
            <div className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-(--hover)" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-32 rounded bg-(--hover)" />
                      <div className="h-2.5 w-20 rounded bg-(--hover)" />
                    </div>
                  </div>
                  <div className="h-3 w-40 rounded bg-(--hover) hidden md:block" />
                  <div className="h-3 w-24 rounded bg-(--hover) hidden md:block" />
                  <div className="h-7 w-20 rounded-xl bg-(--hover)" />
                </div>
              ))}
            </div>
          </div>
        ) : isError ? (
          // Error State
          <div
            className="flex flex-col items-center justify-center rounded-[18px] border border-(--border) bg-(--card-surface) p-12 text-center"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <WarningCircle size={36} className="text-rose-400 mb-3" />
            <h3 className="text-base font-semibold text-(--text)">
              Unable to load students
            </h3>
            <p className="mt-1 text-xs text-(--muted) max-w-sm">
              An error occurred while fetching the learners list. Please check
              your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90 cursor-pointer"
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
            isTransitioning={
              isPlaceholderData || (isFetching && !isFetchingNextPage)
            }
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--hover) text-(--muted) mb-3">
              <Users size={28} weight="duotone" />
            </div>
            <h3 className="text-base font-semibold text-(--text)">
              No students found
            </h3>
            <p className="mt-1 max-w-sm text-xs md:text-sm text-(--muted) leading-relaxed">
              {searchQuery || courseFilter !== "all" || statusFilter !== "all"
                ? "No learners match your current search query or active filters. Try adjusting your filters or search terms."
                : "There are no students registered in your academy yet."}
            </p>
            {(searchQuery ||
              courseFilter !== "all" ||
              statusFilter !== "all") && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90 cursor-pointer"
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
