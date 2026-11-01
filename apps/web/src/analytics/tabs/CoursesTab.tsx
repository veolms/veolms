import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { ExamIcon as Exam } from "@phosphor-icons/react/Exam";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { ListNumbersIcon as ListNumbers } from "@phosphor-icons/react/ListNumbers";
import type { AnalyticsCoursesResponse } from "@veolms/contracts";
import type { AnalyticsTabProps } from "@veolms/web-core";
import {
  ChartSection,
  DataTable,
  DonutChart,
  InsightsPanel,
  KpiCard,
  ProgressCell,
  TitleCell,
  TrendChart,
  formatPercent,
  formatPrecisePercent,
  formatWholeNumber,
  kpiGridClass,
  toChartData,
  type DataTableColumn,
} from "@veolms/analytics-ui";
import type { ReactNode } from "react";
import { useAnalyticsCourses } from "../../services/analytics";
import { percentCell, useTabExport } from "../analyticsShared";
import { COURSES_PLACEHOLDER } from "../analyticsPlaceholders";
import { TabState } from "./TabState";

type Courses = AnalyticsCoursesResponse["courses"];
type TopCourseRow = Courses["topCourses"][number];

function formatHoursShort(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(hours)} hrs`;
}

function buildInsights(data: AnalyticsCoursesResponse): string[] {
  const { courses } = data;
  const insights: string[] = [];
  const top = courses.topCourses[0];
  if (top) {
    insights.push(
      `${top.title} drew the most enrollments this period (${formatWholeNumber(top.enrollments)}).`,
    );
  }
  const bestCompletion = [...courses.topCourses]
    .filter((row) => row.learners >= 5)
    .sort((a, b) => b.completionRate - a.completionRate)[0];
  if (bestCompletion && bestCompletion.completionRate > 0) {
    insights.push(
      `${bestCompletion.title} has the highest completion rate, ${formatPercent(bestCompletion.completionRate)} of its learners.`,
    );
  }
  if (courses.content.lessons > 0) {
    insights.push(
      `The catalogue holds ${formatWholeNumber(courses.content.lessons)} published lessons, ${formatHoursShort(courses.content.durationHours)} of video.`,
    );
  }
  if (courses.quizzes.submitted > 0) {
    insights.push(
      `${formatPrecisePercent(courses.quizzes.passRate)} of ${formatWholeNumber(courses.quizzes.submitted)} submitted quiz attempts passed, with an average score of ${formatPrecisePercent(courses.quizzes.averageScore)}.`,
    );
  }
  return insights;
}

function FigureRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] py-2.5 last:border-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--accent)/10 text-(--accent)">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs sm:text-sm text-(--text)">
        {label}
      </span>
      <span className="text-sm font-semibold text-(--text) tabular-nums">
        {value}
      </span>
    </li>
  );
}

function QuizFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2.5">
      <p className="text-[0.68rem] sm:text-xs font-semibold text-(--muted)">
        {label}
      </p>
      <p className="mt-1 text-base sm:text-lg font-bold tracking-tight text-(--text) tabular-nums">
        {value}
      </p>
    </div>
  );
}

export default function CoursesTab({
  filters,
  isAdmin,
  onExportChange,
}: AnalyticsTabProps) {
  const query = useAnalyticsCourses(isAdmin ? "admin" : "instructor", {
    from: filters.from,
    to: filters.to,
    courseId: filters.courseId,
  });
  const data = query.data;

  useTabExport(onExportChange, data, (data) => {
    const { courses } = data;
    return [
      {
        title: "Courses & content",
        headers: ["Metric", "Value", "Change %"],
        rows: [
          [
            "Active courses",
            courses.activeCourses.value,
            courses.activeCourses.changePercent,
          ],
          [
            "Enrollments",
            courses.enrollments.value,
            courses.enrollments.changePercent,
          ],
          [
            "Average completion %",
            percentCell(courses.averageCompletion.value),
            courses.averageCompletion.changePercent,
          ],
          [
            "Lessons published",
            courses.lessonsPublished.value,
            courses.lessonsPublished.changePercent,
          ],
          [
            "Video hours",
            percentCell(courses.totalDurationHours.value),
            courses.totalDurationHours.changePercent,
          ],
          [
            "Quiz attempts",
            courses.quizAttempts.value,
            courses.quizAttempts.changePercent,
          ],
        ],
      },
      {
        title: "Daily enrollments",
        headers: ["Date", "Enrollments"],
        rows: courses.dailyEnrollments.map((day) => [day.date, day.value]),
      },
      {
        title: "Top courses",
        headers: [
          "Course",
          "Enrollments",
          "Learners",
          "Completion %",
          "Avg progress %",
          "Lessons",
          "Video hours",
        ],
        rows: courses.topCourses.map((row) => [
          row.title,
          row.enrollments,
          row.learners,
          percentCell(row.completionRate),
          percentCell(row.averageProgressPercent),
          row.lessons,
          percentCell(row.durationHours),
        ]),
      },
      {
        title: "Content",
        headers: ["Item", "Count"],
        rows: [
          ["Courses", courses.content.courses],
          ["Published courses", courses.content.publishedCourses],
          ["Sections", courses.content.sections],
          ["Lessons", courses.content.lessons],
          ["Video lessons", courses.content.videoLessons],
          ["Document lessons", courses.content.documentLessons],
          ["Quiz lessons", courses.content.quizLessons],
          ["Resources", courses.content.resources],
          ["Video hours", percentCell(courses.content.durationHours)],
        ],
      },
      {
        title: "Quizzes",
        headers: ["Attempts", "Submitted", "Pass rate %", "Average score %"],
        rows: [
          [
            courses.quizzes.attempts,
            courses.quizzes.submitted,
            percentCell(courses.quizzes.passRate),
            percentCell(courses.quizzes.averageScore),
          ],
        ],
      },
    ];
  });

  if (!data) {
    return (
      <TabState
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        placeholder={COURSES_PLACEHOLDER}
      />
    );
  }

  const { courses } = data;
  const { content, quizzes } = courses;

  const columns: DataTableColumn<TopCourseRow>[] = [
    {
      key: "course",
      header: "Course",
      render: (row, index) => (
        <TitleCell
          title={row.title}
          index={index}
          subtitle={`${formatWholeNumber(row.lessons)} lessons · ${formatHoursShort(row.durationHours)}`}
        />
      ),
    },
    {
      key: "enrollments",
      header: "Enrollments",
      numeric: true,
      render: (row) => formatWholeNumber(row.enrollments),
    },
    {
      key: "learners",
      header: "Learners",
      numeric: true,
      hideOnPhone: true,
      render: (row) => formatWholeNumber(row.learners),
    },
    {
      key: "completion",
      header: "Completion",
      numeric: true,
      render: (row) => formatPercent(row.completionRate),
    },
    {
      key: "progress",
      header: "Avg Progress",
      numeric: true,
      hideOnPhone: true,
      render: (row) => <ProgressCell percent={row.averageProgressPercent} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:gap-6">
      <section className={kpiGridClass}>
        <KpiCard
          icon={<BookOpen size={20} weight="bold" />}
          label="Active Courses"
          kpi={courses.activeCourses}
          tone="blue"
        />
        <KpiCard
          icon={<Student size={20} weight="bold" />}
          label="Enrollments"
          kpi={courses.enrollments}
          tone="emerald"
          trend={courses.dailyEnrollments.map((day) => day.value)}
        />
        <KpiCard
          icon={<CheckCircle size={20} weight="bold" />}
          label="Avg Completion"
          kpi={courses.averageCompletion}
          format={formatPercent}
          tone="violet"
        />
        <KpiCard
          icon={<PlayCircle size={20} weight="bold" />}
          label="Lessons Published"
          kpi={courses.lessonsPublished}
          tone="accent"
        />
        <KpiCard
          icon={<Clock size={20} weight="bold" />}
          label="Video Content"
          kpi={courses.totalDurationHours}
          format={formatHoursShort}
          tone="amber"
        />
        <KpiCard
          icon={<Exam size={20} weight="bold" />}
          label="Quiz Attempts"
          kpi={courses.quizAttempts}
          tone="teal"
        />
      </section>

      <ChartSection
        title="Enrollments Over Time"
        description="New enrollments per UTC day, every source"
      >
        <TrendChart
          data={toChartData(courses.dailyEnrollments)}
          tone="emerald"
          name="Enrollments"
          valueFormatter={formatWholeNumber}
        />
      </ChartSection>

      <div className="grid grid-cols-1 gap-3.5 sm:gap-6 lg:grid-cols-5">
        <ChartSection
          title="Top Courses"
          description="By enrollments in this period"
          className="lg:col-span-3"
        >
          <DataTable
            rows={courses.topCourses}
            columns={columns}
            rowKey={(row) => row.courseId}
            emptyTitle="No course activity yet"
            emptyMessage="Courses will show up here once there's enrollment activity."
          />
        </ChartSection>
        <ChartSection
          title="Content Insights"
          description="What the catalogue holds today"
          className="lg:col-span-2"
        >
          <ul>
            <FigureRow
              icon={<BookOpen size={16} weight="bold" />}
              label="Published courses"
              value={`${formatWholeNumber(content.publishedCourses)} of ${formatWholeNumber(content.courses)}`}
            />
            <FigureRow
              icon={<ListNumbers size={16} weight="bold" />}
              label="Sections"
              value={formatWholeNumber(content.sections)}
            />
            <FigureRow
              icon={<PlayCircle size={16} weight="bold" />}
              label="Video lessons"
              value={formatWholeNumber(content.videoLessons)}
            />
            <FigureRow
              icon={<FileText size={16} weight="bold" />}
              label="Document lessons"
              value={formatWholeNumber(content.documentLessons)}
            />
            <FigureRow
              icon={<Exam size={16} weight="bold" />}
              label="Quiz lessons"
              value={formatWholeNumber(content.quizLessons)}
            />
            <FigureRow
              icon={<Paperclip size={16} weight="bold" />}
              label="Resources"
              value={formatWholeNumber(content.resources)}
            />
            <FigureRow
              icon={<Clock size={16} weight="bold" />}
              label="Total video"
              value={formatHoursShort(content.durationHours)}
            />
          </ul>
        </ChartSection>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:gap-6 lg:grid-cols-2">
        <ChartSection
          title="Lesson Mix"
          description="Published lessons by type"
        >
          <DonutChart
            slices={[
              { label: "Video", value: content.videoLessons, tone: "accent" },
              {
                label: "Document",
                value: content.documentLessons,
                tone: "blue",
              },
              { label: "Quiz", value: content.quizLessons, tone: "amber" },
            ]}
            totalLabel="Lessons"
            emptyMessage="Lesson types appear once a lesson is published."
          />
        </ChartSection>
        <ChartSection
          title="Quiz Results"
          description="Attempts started in this period"
        >
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <QuizFigure
              label="Attempts"
              value={formatWholeNumber(quizzes.attempts)}
            />
            <QuizFigure
              label="Submitted"
              value={formatWholeNumber(quizzes.submitted)}
            />
            <QuizFigure
              label="Pass Rate"
              value={formatPrecisePercent(quizzes.passRate)}
            />
            <QuizFigure
              label="Average Score"
              value={formatPrecisePercent(quizzes.averageScore)}
            />
          </div>
          {quizzes.submitted > 0 ? (
            <div className="mt-3.5">
              <div className="flex items-center justify-between text-xs text-(--muted)">
                <span>Pass rate</span>
                <span className="tabular-nums">
                  {formatPrecisePercent(quizzes.passRate)}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, quizzes.passRate))}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-3.5 text-xs text-(--muted)">
              No quiz attempts were submitted in this period.
            </p>
          )}
        </ChartSection>
      </div>

      <InsightsPanel insights={buildInsights(data)} />
    </div>
  );
}
