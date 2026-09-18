import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "../hooks/useDebounce";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react/FunnelSimple";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/Gauge";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { QuizStatus } from "@veolms/contracts";
import { Button } from "../components/Button";
import { ThemedSelect, type ThemedSelectOption } from "../ThemedSelect";
import { useMyCourses } from "../services/courses";
import { useStudents } from "../services/students";
import {
  quizKeys,
  quizzesService,
  useCourseQuizAnalytics,
  useCourseQuizAssignments,
  useMyQuizAssignments,
  useQuizAnalytics,
  useQuizHistory,
  useStudentQuizReport,
  useMyQuizzes,
} from "../services/quizzes";

interface Props {
  role: "student" | "creator";
  onNavigatePage?: (destination: string) => void;
}

type InstructorView = "overview" | "library" | "analytics";
type LearnerFilter = "all" | "todo" | "in_progress" | "completed";

const surfaceClass =
  "rounded-[14px] sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-shadow,var(--surface-depth-shadow))";
const insetClass =
  "rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,color-mix(in_srgb,var(--surface-strong,var(--surface))_85%,var(--surface))) shadow-(--card-shadow,var(--surface-depth-shadow))";
const inputClass =
  "h-9 sm:h-10 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] px-2.5 sm:px-3.5 text-xs sm:text-sm text-(--text) outline-none transition-all placeholder:text-(--muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)/20";

function percent(value: number | null | undefined) {
  return `${Math.round(value ?? 0)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: QuizStatus) {
  return status === "published"
    ? "Published"
    : status === "archived"
      ? "Archived"
      : "Draft";
}

function useInfiniteList<T>(items: readonly T[], initialLimit = 20, step = 20) {
  const [limit, setLimit] = useState(initialLimit);

  useEffect(() => {
    setLimit(initialLimit);
  }, [items.length, initialLimit]);

  const hasMore = limit < items.length;
  const loadMore = useCallback(() => {
    setLimit((prev) => Math.min(prev + step, items.length));
  }, [items.length, step]);

  const displayedItems = useMemo(() => items.slice(0, limit), [items, limit]);

  return {
    displayedItems,
    hasMore,
    loadMore,
    totalCount: items.length,
    displayedCount: Math.min(limit, items.length),
  };
}

function InfiniteScrollSentinel({
  hasMore,
  onLoadMore,
  containerRef,
}: {
  hasMore: boolean;
  onLoadMore: () => void;
  containerRef?: React.RefObject<HTMLElement | null>;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            onLoadMore();
          }
        },
        {
          root: containerRef?.current ?? null,
          rootMargin: "140px",
        },
      );
      observer.observe(sentinel);
      return () => observer.disconnect();
    }

    const target = containerRef?.current ?? window;
    const handleScroll = () => {
      if (!sentinel) return;
      const rect = sentinel.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      if (rect.top <= viewportHeight + 140) {
        onLoadMore();
      }
    };
    target.addEventListener("scroll", handleScroll, { passive: true });
    return () => target.removeEventListener("scroll", handleScroll);
  }, [hasMore, onLoadMore, containerRef]);

  if (!hasMore) return null;

  return (
    <div
      ref={sentinelRef}
      className="flex items-center justify-center p-3 text-xs text-(--muted)"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 opacity-75">
        <span className="size-1.5 rounded-full bg-(--accent) animate-ping" />
        Loading more…
      </span>
    </div>
  );
}

export function QuizAnalyticsPage({ role, onNavigatePage }: Props) {
  if (role === "creator") {
    return <InstructorQuizHub onNavigatePage={onNavigatePage} />;
  }
  return <LearnerQuizDashboard onNavigatePage={onNavigatePage} />;
}

function QuizPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="pt-2 sm:pt-0 flex flex-col gap-3.5 sm:gap-5 border-b border-(--border) pb-4.5 sm:pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-(--accent)">
          <span
            className="size-1.5 rounded-full bg-(--accent)"
            aria-hidden="true"
          />
          {eyebrow}
        </p>
        <h1 className="mt-2.5 sm:mt-2 text-[clamp(1.75rem,3vw,2.55rem)] font-semibold tracking-[-0.04em] text-(--text)">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-(--muted)">
          {description}
        </p>
      </div>
      {action ? (
        <div className="shrink-0 pt-2 pb-0.5 sm:py-0">{action}</div>
      ) : null}
    </header>
  );
}

function HubTabs({
  value,
  onChange,
}: {
  value: InstructorView;
  onChange: (value: InstructorView) => void;
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 sm:gap-1.5 rounded-[12px] sm:rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-1 sm:p-1.5 shadow-[inset_0_1px_2px_color-mix(in_srgb,black_10%,transparent)]"
      aria-label="Quiz workspace"
    >
      {(
        [
          ["overview", "Overview"],
          ["library", "Quiz library"],
          ["analytics", "Analytics"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-[8px] sm:rounded-[10px] px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            value === key
              ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-[var(--card-compact-shadow)]"
              : "text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
          }`}
          aria-current={value === key ? "page" : undefined}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function InstructorQuizHub({ onNavigatePage }: Pick<Props, "onNavigatePage">) {
  const [view, setView] = useState<InstructorView>("overview");
  const quizzes = useMyQuizzes();

  return (
    <main
      data-quiz-surface=""
      className="mx-auto grid w-full max-w-[1320px] gap-3.5 sm:gap-6 px-0 py-0.5 sm:p-6 xl:p-8"
      aria-labelledby="quiz-hub-title"
    >
      <QuizPageHeader
        eyebrow="Assessment workspace"
        title="Quiz command centre"
        description="Build assessments, configure course delivery, and understand exactly where learners are succeeding or getting stuck."
        action={
          <Button
            onClick={() => onNavigatePage?.("/quizzes/create")}
            className="inline-flex items-center gap-2"
          >
            <Plus size={18} weight="bold" aria-hidden="true" />
            <span>Create quiz</span>
          </Button>
        }
      />
      <HubTabs value={view} onChange={setView} />
      {view === "overview" ? (
        <InstructorOverview
          quizzes={quizzes.data ?? []}
          onNavigatePage={onNavigatePage}
          onSelectView={setView}
        />
      ) : null}
      {view === "library" ? (
        <QuizLibrary
          quizzes={quizzes.data ?? []}
          isLoading={quizzes.isLoading}
          onNavigatePage={onNavigatePage}
        />
      ) : null}
      {view === "analytics" ? <InstructorAnalytics /> : null}
    </main>
  );
}

function InstructorOverview({
  quizzes,
  onNavigatePage,
  onSelectView,
}: {
  quizzes: NonNullable<ReturnType<typeof useMyQuizzes>["data"]>;
  onNavigatePage?: (destination: string) => void;
  onSelectView?: (view: InstructorView) => void;
}) {
  const courses = useMyCourses();
  const [courseId, setCourseId] = useState<string | null>(null);
  const courseAnalytics = useCourseQuizAnalytics(courseId);
  const assignments = useCourseQuizAssignments(courseId);
  const studentsQuery = useStudents({ limit: 1 });

  const courseList = useMemo(
    () => courses.data?.courses ?? [],
    [courses.data?.courses],
  );

  const allCourseAnalyticsQueries = useQueries({
    queries: courseList.map((course) => ({
      queryKey: quizKeys.courseAnalytics(course.id),
      queryFn: () => quizzesService.courseAnalytics(course.id),
      staleTime: 30_000,
    })),
  });

  useEffect(() => {
    if (courseId && courses.data?.courses) {
      const exists = courses.data.courses.some((c) => c.id === courseId);
      if (!exists) {
        setCourseId(null);
      }
    }
  }, [courseId, courses.data?.courses]);

  const analytics = courseAnalytics.data;
  const published = quizzes.filter(
    (quiz) => quiz.status === "published",
  ).length;
  const drafts = quizzes.filter((quiz) => quiz.status === "draft").length;

  const totalAssignedAssessmentsAcrossAll = useMemo(() => {
    return allCourseAnalyticsQueries.reduce((sum, q) => {
      return sum + (q.data?.totalQuizzes ?? 0);
    }, 0);
  }, [allCourseAnalyticsQueries]);

  const totalLearnersAcrossAll = useMemo(() => {
    if (typeof studentsQuery.data?.pages[0]?.totalCount === "number") {
      return studentsQuery.data.pages[0].totalCount;
    }
    const studentCounts = allCourseAnalyticsQueries
      .map((q) => q.data?.students)
      .filter((val): val is number => typeof val === "number");
    if (studentCounts.length > 0) {
      return Math.max(...studentCounts);
    }
    return null;
  }, [studentsQuery.data, allCourseAnalyticsQueries]);

  const coursesWithAttempts = useMemo(() => {
    return allCourseAnalyticsQueries
      .map((q) => q.data)
      .filter((data): data is NonNullable<typeof data> =>
        Boolean(
          data &&
          data.totalQuizzes > 0 &&
          (data.quizCompletionRate > 0 ||
            data.quizzes.some(
              (q) => q.completionRate > 0 || q.averageScore > 0,
            )),
        ),
      );
  }, [allCourseAnalyticsQueries]);

  const allCoursesMetrics = useMemo(() => {
    if (coursesWithAttempts.length === 0) {
      return { averageScore: null, passRate: null };
    }
    const avgScoreSum = coursesWithAttempts.reduce(
      (sum, c) => sum + c.averageQuizScore,
      0,
    );
    const passRateSum = coursesWithAttempts.reduce(
      (sum, c) => sum + c.passRate,
      0,
    );
    return {
      averageScore: Math.round(avgScoreSum / coursesWithAttempts.length),
      passRate: Math.round(passRateSum / coursesWithAttempts.length),
    };
  }, [coursesWithAttempts]);

  const assignedCount =
    assignments.data?.length ?? analytics?.totalQuizzes ?? 0;
  const hasCourseAttempts = Boolean(
    analytics &&
    assignedCount > 0 &&
    (analytics.quizCompletionRate > 0 ||
      analytics.quizzes.some(
        (q) => q.completionRate > 0 || q.averageScore > 0,
      )),
  );

  const courseOptions: readonly ThemedSelectOption[] = useMemo(() => {
    const list: ThemedSelectOption[] = [["", "All courses"]];
    const sorted = [...(courses.data?.courses ?? [])].sort((a, b) => {
      const dateA = a.updatedAt
        ? Date.parse(a.updatedAt)
        : a.createdAt
          ? Date.parse(a.createdAt)
          : 0;
      const dateB = b.updatedAt
        ? Date.parse(b.updatedAt)
        : b.createdAt
          ? Date.parse(b.createdAt)
          : 0;
      return dateB - dateA;
    });
    for (const course of sorted) {
      list.push([course.id, course.title]);
    }
    return list;
  }, [courses.data?.courses]);

  const {
    displayedItems: recentQuizzes,
    hasMore: hasMoreRecentQuizzes,
    loadMore: loadMoreRecentQuizzes,
  } = useInfiniteList(quizzes, 20);

  const handlePreviewLearnerView = () => {
    const activeAssignment = assignments.data?.[0];
    if (activeAssignment) {
      onNavigatePage?.(
        `/learn/${encodeURIComponent(activeAssignment.courseId)}?lessonId=${encodeURIComponent(activeAssignment.lessonId)}&view=quiz`,
      );
      return;
    }
    if (courseId) {
      const match = courses.data?.courses.find((c) => c.id === courseId);
      onNavigatePage?.(
        `/learn/${encodeURIComponent(match?.slug || courseId)}?view=quiz`,
      );
      return;
    }
    const firstCourse = courses.data?.courses?.[0];
    if (firstCourse) {
      onNavigatePage?.(
        `/learn/${encodeURIComponent(firstCourse.slug || firstCourse.id)}?view=quiz`,
      );
      return;
    }
    onNavigatePage?.("/quizzes");
  };

  return (
    <div className="grid gap-3.5 sm:gap-6">
      <section
        className="relative overflow-hidden rounded-[14px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_18%,var(--surface)),var(--surface)_55%,color-mix(in_srgb,var(--canvas)_80%,var(--surface)))] p-3 sm:p-8"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div
          className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-(--accent)/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative grid gap-4 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center">
          <div>
            <div className="flex size-9 sm:size-11 items-center justify-center rounded-xl bg-(--accent) text-(--on-accent) shadow-lg shadow-(--accent-shadow)/30">
              <ChartBar
                size={20}
                className="sm:hidden"
                weight="bold"
                aria-hidden="true"
              />
              <ChartBar
                size={24}
                className="hidden sm:block"
                weight="bold"
                aria-hidden="true"
              />
            </div>
            <h2 className="mt-3 sm:mt-5 max-w-2xl text-xl font-bold tracking-tight text-(--text) sm:text-3xl">
              A clearer view of assessment health.
            </h2>
            <p className="mt-2 sm:mt-3 max-w-xl text-xs sm:text-sm leading-relaxed text-(--muted)">
              See the signal behind every quiz: participation, completion, pass
              rate, and the learners who need a little more support.
            </p>
          </div>
          <div
            className="grid gap-2 rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface-raised,var(--surface-strong)) p-2.5 sm:p-4.5"
            style={{ boxShadow: "var(--card-compact-shadow)" }}
          >
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-(--muted)">
              Course lens
            </p>
            <ThemedSelect
              value={courseId ?? ""}
              onValueChange={(val) => setCourseId(val || null)}
              options={courseOptions}
              searchable
              searchPlaceholder="Search courses..."
              defaultLimit={5}
              ariaLabel="Choose a course for the overview"
              triggerClassName="!h-9 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-2.5 sm:!px-3.5 !text-xs sm:!text-sm !font-semibold !text-(--text) focus:!border-(--accent)"
            />
            <p className="text-xs text-(--muted)">
              {courseId
                ? `${assignedCount} assigned assessment${assignedCount === 1 ? "" : "s"} in this course`
                : `${totalAssignedAssessmentsAcrossAll} assigned assessment${totalAssignedAssessmentsAcrossAll === 1 ? "" : "s"} across ${courseList.length} course${courseList.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<ChartBar size={20} weight="bold" />}
          label="Total quizzes"
          value={quizzes.length}
          detail={`${published} published · ${drafts} drafts`}
        />
        <StatCard
          icon={<Users size={20} weight="bold" />}
          label="Enrolled learners"
          value={
            courseId
              ? courseAnalytics.isLoading
                ? "—"
                : (analytics?.students ?? 0)
              : (totalLearnersAcrossAll ?? (studentsQuery.isLoading ? "—" : 0))
          }
          detail={courseId ? "Enrolled in this course" : "Across all courses"}
        />
        <StatCard
          icon={<Gauge size={20} weight="bold" />}
          label="Average score"
          value={
            courseId
              ? courseAnalytics.isLoading
                ? "—"
                : hasCourseAttempts
                  ? percent(analytics?.averageQuizScore)
                  : "—"
              : allCoursesMetrics.averageScore !== null
                ? `${allCoursesMetrics.averageScore}%`
                : "—"
          }
          detail={
            courseId
              ? assignedCount === 0
                ? "No assessments in this course"
                : hasCourseAttempts
                  ? "Course-wide average"
                  : "No graded attempts yet"
              : allCoursesMetrics.averageScore !== null
                ? "Across courses with attempts"
                : totalAssignedAssessmentsAcrossAll > 0
                  ? "No graded attempts yet"
                  : "No assessments assigned yet"
          }
        />
        <StatCard
          icon={<CheckCircle size={20} weight="bold" />}
          label="Pass rate"
          value={
            courseId
              ? courseAnalytics.isLoading
                ? "—"
                : hasCourseAttempts
                  ? percent(analytics?.passRate)
                  : "—"
              : allCoursesMetrics.passRate !== null
                ? `${allCoursesMetrics.passRate}%`
                : "—"
          }
          detail={
            courseId
              ? assignedCount === 0
                ? "No assessments in this course"
                : hasCourseAttempts
                  ? "Latest graded outcomes"
                  : "No graded attempts yet"
              : allCoursesMetrics.passRate !== null
                ? "Across courses with attempts"
                : totalAssignedAssessmentsAcrossAll > 0
                  ? "No graded attempts yet"
                  : "No assessments assigned yet"
          }
          tone="success"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <section
          className={`${surfaceClass} overflow-hidden`}
          aria-labelledby="recent-quizzes-title"
        >
          <SectionHeading
            title="Recent assessments"
            description="Your latest quiz content and publishing state."
            action={
              <button
                type="button"
                onClick={() =>
                  onSelectView
                    ? onSelectView("library")
                    : onNavigatePage?.("/quizzes")
                }
                className="text-sm font-semibold text-(--accent) hover:underline cursor-pointer"
              >
                View library
              </button>
            }
          />
          <div className="divide-y divide-(--border)">
            {recentQuizzes.map((quiz) => (
              <QuizLibraryRow
                key={quiz.id}
                quiz={quiz}
                onEdit={() => onNavigatePage?.(`/quizzes/${quiz.id}`)}
              />
            ))}
            <InfiniteScrollSentinel
              hasMore={hasMoreRecentQuizzes}
              onLoadMore={loadMoreRecentQuizzes}
            />
            {quizzes.length === 0 ? (
              <EmptyState
                icon={<ChartBar size={22} />}
                title="No quizzes yet"
                message="Create your first assessment to start measuring learning outcomes."
                action={
                  <Button onClick={() => onNavigatePage?.("/quizzes/create")}>
                    <Plus size={17} weight="bold" />
                    <span>Create quiz</span>
                  </Button>
                }
              />
            ) : null}
          </div>
        </section>
        <section
          className={`${surfaceClass} p-2.5 sm:p-6`}
          aria-labelledby="quiz-actions-title"
        >
          <SectionHeading
            title="Quick actions"
            description="Keep your assessment workflow moving."
          />
          <div className="mt-5 grid gap-2">
            <QuickAction
              icon={<Plus size={19} weight="bold" />}
              title="Create a quiz"
              detail="Start a new draft"
              onClick={() => onNavigatePage?.("/quizzes/create")}
            />
            <QuickAction
              icon={<ChartBar size={19} weight="bold" />}
              title="Review analytics"
              detail="Find learner friction"
              onClick={() =>
                onSelectView
                  ? onSelectView("analytics")
                  : onNavigatePage?.("/analytics")
              }
            />
            <QuickAction
              icon={<Eye size={19} weight="bold" />}
              title="Preview learner view"
              detail="Check an attempt flow"
              onClick={handlePreviewLearnerView}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function QuizLibrary({
  quizzes,
  isLoading,
  onNavigatePage,
}: {
  quizzes: NonNullable<ReturnType<typeof useMyQuizzes>["data"]>;
  isLoading: boolean;
  onNavigatePage?: (destination: string) => void;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, DEFAULT_DEBOUNCE_DELAY_MS);
  const [status, setStatus] = useState<QuizStatus | "all">("all");
  const visible = quizzes.filter(
    (quiz) =>
      (status === "all" || quiz.status === status) &&
      quiz.title.toLowerCase().includes(debouncedSearch.trim().toLowerCase()),
  );
  const {
    displayedItems: displayedLibraryQuizzes,
    hasMore: hasMoreLibraryQuizzes,
    loadMore: loadMoreLibraryQuizzes,
  } = useInfiniteList(visible, 20);

  return (
    <section
      className={`${surfaceClass} overflow-hidden`}
      aria-labelledby="quiz-library-title"
    >
      <div className="border-b border-(--border) p-3 sm:p-7">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
              Content library
            </p>
            <h2
              id="quiz-library-title"
              className="mt-1 text-lg sm:text-xl font-semibold"
            >
              All quizzes
            </h2>
            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-(--muted)">
              Draft, publish, and maintain versioned assessment content.
            </p>
          </div>
          <Button
            onClick={() => onNavigatePage?.("/quizzes/create")}
            className="h-9 sm:h-10 text-xs sm:text-sm"
          >
            <Plus size={16} weight="bold" />
            <span>New quiz</span>
          </Button>
        </div>
        <div className="mt-4 sm:mt-6 grid gap-2.5 sm:gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="relative flex items-center">
            <span className="sr-only">Search quizzes</span>
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 text-(--muted)"
              size={16}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quizzes by title..."
              className={`${inputClass} w-full pl-9`}
            />
          </label>
          <ThemedSelect
            value={status}
            onValueChange={(val) => setStatus(val as QuizStatus | "all")}
            options={[
              ["all", "All statuses"],
              ["published", "Published"],
              ["draft", "Draft"],
              ["archived", "Archived"],
            ]}
            ariaLabel="Filter quiz status"
            triggerClassName="!h-9 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-2.5 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
          />
        </div>
      </div>
      <div className="divide-y divide-(--border)">
        {isLoading ? <LoadingRows /> : null}
        {!isLoading
          ? displayedLibraryQuizzes.map((quiz) => (
              <QuizLibraryRow
                key={quiz.id}
                quiz={quiz}
                expanded
                onEdit={() => onNavigatePage?.(`/quizzes/${quiz.id}`)}
              />
            ))
          : null}
        <InfiniteScrollSentinel
          hasMore={hasMoreLibraryQuizzes}
          onLoadMore={loadMoreLibraryQuizzes}
        />
        {!isLoading && visible.length === 0 ? (
          <EmptyState
            icon={<MagnifyingGlass size={22} />}
            title="No matching quizzes"
            message={
              quizzes.length
                ? "Try another search or status filter."
                : "Create your first quiz to build your assessment library."
            }
            action={
              !quizzes.length ? (
                <Button onClick={() => onNavigatePage?.("/quizzes/create")}>
                  <Plus size={17} weight="bold" />
                  <span>Create quiz</span>
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </div>
    </section>
  );
}

function InstructorAnalytics() {
  const courses = useMyCourses();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const assignments = useCourseQuizAssignments(courseId);
  const courseAnalytics = useCourseQuizAnalytics(courseId);
  const assignmentAnalytics = useQuizAnalytics(assignmentId);
  const studentReport = useStudentQuizReport(studentId);
  const studentsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!courseId && courses.data?.courses[0]) {
      setCourseId(courses.data.courses[0].id);
    }
  }, [courseId, courses.data?.courses]);
  useEffect(() => {
    const first = assignments.data?.[0];
    if (
      !assignmentId ||
      !assignments.data?.some((item) => item.id === assignmentId)
    ) {
      setAssignmentId(first?.id ?? null);
    }
  }, [assignmentId, assignments.data]);

  const analytics = courseAnalytics.data;

  const courseOptions: readonly ThemedSelectOption[] = useMemo(() => {
    const sorted = [...(courses.data?.courses ?? [])].sort((a, b) => {
      const dateA = a.updatedAt
        ? Date.parse(a.updatedAt)
        : a.createdAt
          ? Date.parse(a.createdAt)
          : 0;
      const dateB = b.updatedAt
        ? Date.parse(b.updatedAt)
        : b.createdAt
          ? Date.parse(b.createdAt)
          : 0;
      return dateB - dateA;
    });
    return sorted.map((course) => [course.id, course.title] as const);
  }, [courses.data?.courses]);

  const assignmentOptions: readonly ThemedSelectOption[] = useMemo(() => {
    const list: ThemedSelectOption[] = [["", "Select assessment"]];
    for (const item of assignments.data ?? []) {
      list.push([item.id, item.quizTitle]);
    }
    return list;
  }, [assignments.data]);

  const {
    displayedItems: displayedQuizzes,
    hasMore: hasMoreQuizzes,
    loadMore: loadMoreQuizzes,
  } = useInfiniteList(analytics?.quizzes ?? [], 20);

  const {
    displayedItems: displayedStudents,
    hasMore: hasMoreStudents,
    loadMore: loadMoreStudents,
  } = useInfiniteList(assignmentAnalytics.data?.students ?? [], 20);

  return (
    <div className="grid gap-3.5 sm:gap-6">
      <section className={`${surfaceClass} p-3 sm:p-7`}>
        <div className="flex flex-col gap-3.5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
              Instructor reporting
            </p>
            <h2 className="mt-1 text-lg sm:text-xl font-semibold">
              Performance overview
            </h2>
            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-(--muted)">
              Compare outcomes at course, assessment, and student level.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 min-w-56 sm:min-w-64">
            <span className="text-xs font-semibold text-(--muted)">Course</span>
            <ThemedSelect
              value={courseId ?? ""}
              onValueChange={(val) => {
                setCourseId(val || null);
                setAssignmentId(null);
                setStudentId(null);
              }}
              options={courseOptions}
              searchable
              searchPlaceholder="Search courses..."
              defaultLimit={5}
              ariaLabel="Select course for performance overview"
              triggerClassName="!h-9 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-2.5 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
            />
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard
          label="Assigned"
          value={assignmentAnalytics.data?.assignedStudents ?? "—"}
          compact
        />
        <StatCard
          label="Attempted"
          value={assignmentAnalytics.data?.attempted ?? "—"}
          compact
        />
        <StatCard
          label="Passed"
          value={assignmentAnalytics.data?.passed ?? "—"}
          compact
          tone="success"
        />
        <StatCard
          label="Failed"
          value={assignmentAnalytics.data?.failed ?? "—"}
          compact
          tone="danger"
        />
        <StatCard
          label="Not attempted"
          value={assignmentAnalytics.data?.notAttempted ?? "—"}
          compact
        />
        <StatCard
          label="Average"
          value={
            assignmentAnalytics.data && assignmentAnalytics.data.attempted > 0
              ? percent(assignmentAnalytics.data.averageScore)
              : "—"
          }
          compact
        />
        <StatCard
          label="Highest"
          value={
            assignmentAnalytics.data && assignmentAnalytics.data.attempted > 0
              ? percent(assignmentAnalytics.data.highestScore)
              : "—"
          }
          compact
          tone="success"
        />
        <StatCard
          label="Lowest"
          value={
            assignmentAnalytics.data && assignmentAnalytics.data.attempted > 0
              ? percent(assignmentAnalytics.data.lowestScore)
              : "—"
          }
          compact
          tone="danger"
        />
      </div>
      <div className="grid gap-3.5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.6fr)]">
        <section
          className={`${surfaceClass} overflow-hidden`}
          aria-labelledby="assessment-breakdown-title"
        >
          <div className="flex flex-col gap-3 sm:gap-4 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h2
                id="assessment-breakdown-title"
                className="text-base sm:text-lg font-semibold"
              >
                Assessment breakdown
              </h2>
              <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-(--muted)">
                Select an assessment to inspect its learner outcomes.
              </p>
            </div>
            <div className="min-w-56 sm:min-w-64">
              <ThemedSelect
                value={assignmentId ?? ""}
                onValueChange={(val) => {
                  setAssignmentId(val || null);
                  setStudentId(null);
                }}
                options={assignmentOptions}
                searchable
                searchPlaceholder="Search assessments..."
                defaultLimit={10}
                ariaLabel="Select assessment"
                triggerClassName="!h-9 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-2.5 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)"
              />
            </div>
          </div>
          {analytics ? (
            <div className="grid grid-cols-2 gap-2.5 border-b border-(--border) p-3 sm:grid-cols-4 sm:p-7">
              <MetricTile
                label="Course quizzes"
                value={analytics.totalQuizzes}
              />
              <MetricTile label="Required" value={analytics.requiredQuizzes} />
              <MetricTile
                label="Completion"
                value={
                  analytics.totalQuizzes > 0
                    ? percent(analytics.quizCompletionRate)
                    : "—"
                }
              />
              <MetricTile
                label="Pass rate"
                value={
                  analytics.totalQuizzes > 0 &&
                  (analytics.quizCompletionRate > 0 ||
                    analytics.quizzes.some(
                      (q) => q.completionRate > 0 || q.averageScore > 0,
                    ))
                    ? percent(analytics.passRate)
                    : "—"
                }
              />
            </div>
          ) : null}
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-4 border-b border-(--border) px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-(--muted) sm:grid sm:px-7 sm:py-3">
            <span>Assessment</span>
            <span>Average</span>
            <span>Completion</span>
            <span>Pass rate</span>
          </div>
          {displayedQuizzes.map((quiz) => (
            <div
              key={quiz.assignmentId}
              className={`grid gap-2.5 border-b border-(--border) px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] sm:items-center sm:gap-4 sm:px-7 sm:py-4 ${assignmentId === quiz.assignmentId ? "bg-(--accent)/5" : ""}`}
            >
              <button
                type="button"
                onClick={() => {
                  setAssignmentId(quiz.assignmentId);
                  setStudentId(null);
                }}
                className="text-left font-semibold hover:text-(--accent)"
              >
                {quiz.quizTitle}
                <span className="mt-1 block text-xs font-normal text-(--muted) sm:hidden">
                  {percent(quiz.averageScore)} average ·{" "}
                  {percent(quiz.completionRate)} complete ·{" "}
                  {percent(quiz.passRate)} passed
                </span>
              </button>
              <span className="hidden text-sm text-(--muted) sm:block">
                {percent(quiz.averageScore)}
              </span>
              <span className="hidden text-sm text-(--muted) sm:block">
                {percent(quiz.completionRate)}
              </span>
              <span className="hidden text-sm text-(--muted) sm:block">
                {percent(quiz.passRate)}
              </span>
            </div>
          ))}
          <InfiniteScrollSentinel
            hasMore={hasMoreQuizzes}
            onLoadMore={loadMoreQuizzes}
          />
          {!analytics?.quizzes.length ? (
            <EmptyState
              icon={<ChartBar size={22} />}
              title="No course analytics yet"
              message="Publish and assign a quiz to start collecting outcomes."
            />
          ) : null}
        </section>
        <section
          className={`${surfaceClass} overflow-hidden`}
          aria-labelledby="student-outcomes-title"
        >
          <SectionHeading
            title="Student outcomes"
            description="Choose a learner to open their quiz report."
          />
          <div
            ref={studentsContainerRef}
            className="divide-y divide-(--border) max-h-[580px] overflow-y-auto"
          >
            {displayedStudents.map((student) => (
              <button
                key={student.studentId}
                type="button"
                onClick={() => setStudentId(student.studentId)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-4 text-left transition-colors hover:bg-(--hover) ${studentId === student.studentId ? "bg-(--accent)/5" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {student.studentName}
                  </span>
                  <span className="mt-1 block text-xs text-(--muted)">
                    {student.attemptCount} attempt
                    {student.attemptCount === 1 ? "" : "s"} ·{" "}
                    {student.lastAttempt
                      ? formatDate(student.lastAttempt)
                      : "Never attempted"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block text-sm font-semibold ${student.status === "passed" ? "text-emerald-500" : student.status === "failed" ? "text-red-400" : "text-(--text)"}`}
                  >
                    {student.latestScore === null
                      ? "—"
                      : percent(student.latestScore)}
                  </span>
                  <span className="mt-1 block text-[0.68rem] capitalize text-(--muted)">
                    {student.status.replaceAll("_", " ")}
                  </span>
                </span>
              </button>
            ))}
            <InfiniteScrollSentinel
              hasMore={hasMoreStudents}
              onLoadMore={loadMoreStudents}
              containerRef={studentsContainerRef}
            />
            {!assignmentAnalytics.data?.students.length ? (
              <EmptyState
                compact
                icon={<Users size={22} />}
                title="No learner data"
                message="Select an assessment to view participation."
              />
            ) : null}
          </div>
        </section>
      </div>
      {studentReport.data ? (
        <StudentReportPanel
          report={studentReport.data}
          onClose={() => setStudentId(null)}
        />
      ) : null}
    </div>
  );
}

function StudentReportPanel({
  report,
  onClose,
}: {
  report: NonNullable<ReturnType<typeof useStudentQuizReport>["data"]>;
  onClose: () => void;
}) {
  return (
    <section
      className={`${surfaceClass} overflow-hidden`}
      aria-labelledby="student-report-title"
    >
      <div className="flex items-start justify-between gap-3 border-b border-(--border) p-3 sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
            Learner report
          </p>
          <h2
            id="student-report-title"
            className="mt-1 text-lg sm:text-xl font-semibold"
          >
            Quiz history and outcomes
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close student report"
          className="rounded-lg p-1.5 sm:p-2 text-(--muted) hover:bg-(--hover) hover:text-(--text) cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 border-b border-(--border) p-3 sm:grid-cols-4 sm:p-7">
        <MetricTile label="Completed" value={report.completedQuizzes} />
        <MetricTile label="Passed" value={report.passed} />
        <MetricTile
          label="Average score"
          value={percent(report.averageScore)}
        />
        <MetricTile label="Best score" value={percent(report.bestScore)} />
      </div>
      <div className="divide-y divide-(--border)">
        {report.quizzes.map((quiz) => (
          <div
            key={quiz.assignmentId}
            className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2.5 sm:px-7 sm:py-4"
          >
            <div>
              <p className="font-semibold">{quiz.quizTitle}</p>
              <p className="mt-1 text-xs capitalize text-(--muted)">
                {quiz.attempts} attempt{quiz.attempts === 1 ? "" : "s"} ·{" "}
                {quiz.status.replaceAll("_", " ")}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">Best {percent(quiz.bestScore)}</p>
              <p className="mt-1 text-xs text-(--muted)">
                Latest {percent(quiz.latestScore)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LearnerQuizDashboard({
  onNavigatePage,
}: Pick<Props, "onNavigatePage">) {
  const assignments = useMyQuizAssignments();
  const history = useQuizHistory();
  const [filter, setFilter] = useState<LearnerFilter>("all");
  const available = assignments.data?.assignments ?? [];
  const attempts = history.data ?? [];
  const completed = attempts.filter((item) => item.status === "graded");
  const passed = completed.filter((item) => item.passed).length;
  const average = completed.length
    ? completed.reduce((sum, item) => sum + item.score, 0) / completed.length
    : 0;
  const best = completed.length
    ? Math.max(...completed.map((item) => item.score))
    : 0;
  const filtered = available.filter(
    (assignment) =>
      filter === "all" ||
      (filter === "todo" && assignment.attemptCount === 0) ||
      (filter === "in_progress" && Boolean(assignment.activeAttemptId)) ||
      (filter === "completed" &&
        assignment.latestAttemptStatus !== null &&
        assignment.latestAttemptStatus !== "in_progress"),
  );

  return (
    <main
      data-quiz-surface=""
      className="mx-auto grid w-full max-w-[1320px] gap-3.5 sm:gap-6 px-0 py-0.5 sm:p-8 xl:p-10"
      aria-labelledby="quiz-dashboard-title"
    >
      <QuizPageHeader
        eyebrow="My learning"
        title="Quizzes and results"
        description="Keep your momentum, pick up unfinished assessments, and review the progress you have already earned."
      />
      <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<ChartBar size={20} weight="bold" />}
          label="Assigned"
          value={available.length}
          detail="Across your courses"
        />
        <StatCard
          icon={<Clock size={20} weight="bold" />}
          label="To do"
          value={available.filter((item) => item.attemptCount === 0).length}
          detail="Ready to start"
        />
        <StatCard
          icon={<CheckCircle size={20} weight="bold" />}
          label="Completed"
          value={completed.length}
          detail={`${passed} passed`}
          tone="success"
        />
        <StatCard
          icon={<Gauge size={20} weight="bold" />}
          label="Average score"
          value={percent(average)}
          detail="Across graded attempts"
        />
        <div className="col-span-2 sm:col-span-1">
          <StatCard
            icon={<Student size={20} weight="bold" />}
            label="Best score"
            value={percent(best)}
            detail="Your personal high"
          />
        </div>
      </div>
      <section
        className={`${surfaceClass} overflow-hidden`}
        aria-labelledby="assigned-quizzes-title"
      >
        <div className="flex flex-col gap-3 border-b border-(--border) p-3 sm:p-7 md:flex-row md:items-center md:justify-between">
          <div>
            <h2
              id="assigned-quizzes-title"
              className="text-lg sm:text-xl font-semibold"
            >
              Your assessments
            </h2>
            <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-(--muted)">
              Required work and optional practice in one place.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-1 rounded-lg border border-(--border) bg-(--canvas) p-1"
            role="tablist"
            aria-label="Quiz filters"
          >
            {(
              [
                ["all", "All"],
                ["todo", "To do"],
                ["in_progress", "In progress"],
                ["completed", "Completed"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-semibold ${filter === key ? "bg-(--surface) text-(--text) shadow-sm" : "text-(--muted) hover:text-(--text)"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2.5 sm:gap-3 p-3 sm:grid-cols-2 sm:p-7 xl:grid-cols-3">
          {assignments.isLoading ? (
            <LoadingCards />
          ) : (
            filtered.map((assignment) => (
              <LearnerQuizCard
                key={assignment.id}
                assignment={assignment}
                onOpen={() =>
                  onNavigatePage?.(
                    `/learn/${encodeURIComponent(assignment.courseId)}?lessonId=${encodeURIComponent(assignment.lessonId)}&view=quiz`,
                  )
                }
              />
            ))
          )}
          {!assignments.isLoading && filtered.length === 0 ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <EmptyState
                icon={<ChartBar size={22} />}
                title={
                  available.length
                    ? "Nothing in this view"
                    : "No quizzes assigned yet"
                }
                message={
                  available.length
                    ? "Try another filter to see your assessment activity."
                    : "When an instructor assigns a quiz to one of your courses, it will appear here."
                }
              />
            </div>
          ) : null}
        </div>
      </section>
      <section
        className={`${surfaceClass} overflow-hidden`}
        aria-labelledby="quiz-history-title"
      >
        <SectionHeading
          title="Recent history"
          description="Your latest submitted attempts."
        />
        <div className="divide-y divide-(--border)">
          {attempts.slice(0, 6).map((attempt) => (
            <div
              key={attempt.id}
              className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2.5 sm:px-7 sm:py-4"
            >
              <div>
                <p className="text-sm font-semibold">
                  Attempt {attempt.attemptNumber}
                </p>
                <p className="mt-1 text-xs text-(--muted)">
                  {attempt.submittedAt
                    ? formatDate(attempt.submittedAt)
                    : "In progress"}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${attempt.passed ? "bg-emerald-500/12 text-emerald-500" : attempt.status === "graded" ? "bg-red-500/12 text-red-400" : "bg-(--canvas) text-(--muted)"}`}
              >
                {attempt.status === "graded"
                  ? `${percent(attempt.score)} · ${attempt.passed ? "Passed" : "Not passed"}`
                  : attempt.status.replaceAll("_", " ")}
              </span>
            </div>
          ))}
          {attempts.length === 0 ? (
            <EmptyState
              compact
              icon={<Clock size={22} />}
              title="Your history is empty"
              message="Completed attempts will appear here."
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function LearnerQuizCard({
  assignment,
  onOpen,
}: {
  assignment: NonNullable<
    Awaited<ReturnType<typeof useMyQuizAssignments>>["data"]
  >["assignments"][number];
  onOpen: () => void;
}) {
  const unavailable = Boolean(
    (assignment.availableFrom &&
      Date.parse(assignment.availableFrom) > Date.now()) ||
    (assignment.availableUntil &&
      Date.parse(assignment.availableUntil) < Date.now()),
  );
  const complete =
    assignment.latestAttemptStatus === "graded" ||
    assignment.latestAttemptStatus === "submitted" ||
    assignment.latestAttemptStatus === "expired";
  const action = assignment.activeAttemptId
    ? "Resume quiz"
    : unavailable
      ? "Unavailable"
      : assignment.attemptCount >= assignment.maxAttempts
        ? "Attempts used"
        : assignment.attemptCount
          ? "Try again"
          : "Start quiz";
  return (
    <article
      className="flex min-h-56 flex-col rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:shadow-(--card-hover-shadow)"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-(--accent)/12 text-(--accent)">
          <ChartBar size={20} weight="bold" />
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${
            assignment.activeAttemptId
              ? "bg-amber-500/12 text-amber-500 border border-amber-500/20"
              : complete
                ? assignment.latestPassed
                  ? "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20"
                  : "bg-red-500/12 text-red-400 border border-red-500/20"
                : "bg-(--canvas) text-(--muted) border border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          }`}
        >
          {assignment.activeAttemptId
            ? "In progress"
            : complete
              ? assignment.latestPassed
                ? "Passed"
                : "Review"
              : "To do"}
        </span>
      </div>
      <div className="mt-5">
        <h3 className="line-clamp-2 text-base font-bold text-(--text) tracking-tight">
          {assignment.quizTitle}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-(--muted)">
          {assignment.courseTitle} · {assignment.lessonTitle}
        </p>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-4">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-(--muted) font-semibold">
            Best score
          </p>
          <p className="mt-1 font-bold text-(--text)">
            {percent(assignment.bestScore)}
          </p>
        </div>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-(--muted) font-semibold">
            Attempts
          </p>
          <p className="mt-1 font-bold text-(--text)">
            {assignment.attemptCount} / {assignment.maxAttempts}
          </p>
        </div>
      </div>
      <Button
        onClick={onOpen}
        disabled={
          unavailable ||
          (!assignment.activeAttemptId &&
            assignment.attemptCount >= assignment.maxAttempts)
        }
        className="mt-4 w-full h-10 font-semibold"
      >
        {action}
        <ArrowRight size={17} weight="bold" />
      </Button>
    </article>
  );
}

function QuizLibraryRow({
  quiz,
  onEdit,
  expanded = false,
}: {
  quiz: NonNullable<ReturnType<typeof useMyQuizzes>["data"]>[number];
  onEdit: () => void;
  expanded?: boolean;
}) {
  const latest = quiz.versions.at(-1);
  const published = quiz.versions.filter(
    (version) => version.publishedAt,
  ).length;
  return (
    <div
      className={`flex flex-col gap-3 sm:gap-4 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4 ${expanded ? "hover:bg-(--hover)" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <div className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <ChartBar size={18} className="sm:hidden" weight="bold" />
          <ChartBar size={20} className="hidden sm:block" weight="bold" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm sm:text-base">
            {quiz.title}
          </p>
          <p className="mt-0.5 sm:mt-1 text-[0.72rem] sm:text-xs text-(--muted)">
            {latest?.questions.length ?? 0} questions · {published} published
            version{published === 1 ? "" : "s"} · Updated{" "}
            {formatDate(quiz.updatedAt)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 sm:shrink-0">
        <span
          className={`rounded-full px-2.5 py-0.5 sm:py-1 text-[0.65rem] sm:text-[0.68rem] font-bold uppercase tracking-[0.08em] ${
            quiz.status === "published"
              ? "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20"
              : quiz.status === "archived"
                ? "bg-(--canvas) text-(--muted) border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                : "bg-amber-500/12 text-amber-500 border border-amber-500/20"
          }`}
        >
          {statusLabel(quiz.status)}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-[8px] sm:rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] px-2.5 sm:px-3.5 text-xs font-semibold text-(--text) shadow-[var(--card-compact-shadow)] hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] hover:bg-(--hover) transition-all cursor-pointer"
        >
          <span>Open</span>
          <ArrowRight size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
  compact = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  detail?: string;
  tone?: "default" | "success" | "danger";
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) transition-all duration-200 hover:shadow-(--card-hover-shadow) ${
        compact ? "p-2 sm:p-3.5" : "p-2.5 sm:p-5"
      }`}
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
          {label}
        </p>
        {icon ? (
          <span className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-1.5 sm:mt-2.5 text-xl sm:text-[1.75rem] font-bold tracking-tight ${
          tone === "success"
            ? "text-emerald-500"
            : tone === "danger"
              ? "text-rose-500"
              : "text-(--text)"
        }`}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 sm:mt-1 truncate text-[0.68rem] sm:text-xs text-(--muted)">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <p className="text-xs text-(--muted)">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2.5 sm:p-7">
      <div>
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-(--text)">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-(--muted)">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
function QuickAction({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 sm:gap-3.5 rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_80%,var(--canvas))] p-2.5 sm:p-3.5 text-left shadow-[var(--card-compact-shadow)] transition-all hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface-strong)_90%,var(--surface))] cursor-pointer group"
    >
      <span className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-(--accent)/12 text-(--accent) group-hover:scale-105 transition-transform">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs sm:text-sm font-bold text-(--text)">
          {title}
        </span>
        <span className="mt-0.5 block text-[0.72rem] sm:text-xs text-(--muted)">
          {detail}
        </span>
      </span>
      <ArrowRight
        className="ml-auto text-(--muted) group-hover:text-(--accent) transition-colors"
        size={16}
        weight="bold"
      />
    </button>
  );
}
function EmptyState({
  icon,
  title,
  message,
  action,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid place-items-center text-center ${compact ? "p-5 sm:p-7" : "p-6 sm:p-12"}`}
    >
      <span className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
        {icon}
      </span>
      <h3 className="mt-2.5 sm:mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-(--muted)">
        {message}
      </p>
      {action ? <div className="mt-3.5 sm:mt-4">{action}</div> : null}
    </div>
  );
}
function LoadingRows() {
  return (
    <div className="grid gap-2.5 sm:gap-3 p-3 sm:p-7">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-16 animate-pulse rounded-xl bg-(--canvas)"
        />
      ))}
    </div>
  );
}
function LoadingCards() {
  return (
    <>
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-56 animate-pulse rounded-xl bg-(--canvas)"
        />
      ))}
    </>
  );
}
