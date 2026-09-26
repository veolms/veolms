import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  DashboardRange,
  DashboardRevenueOverview,
  DashboardSummaryResponse,
} from "@veolms/contracts";
import { ArrowDownRightIcon as ArrowDownRight } from "@phosphor-icons/react/ArrowDownRight";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PlusCircleIcon as PlusCircle } from "@phosphor-icons/react/PlusCircle";
import { PulseIcon as Pulse } from "@phosphor-icons/react/Pulse";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import type { Icon } from "@phosphor-icons/react";
import { handleRovingTabKeyDown } from "./accessibility/rovingTabFocus";
import { useDashboard } from "./services/analytics";
import { useDashboardRecentDiscussions } from "./services/learning-interactions";
import { adaptDiscussionWorkspaceItem } from "./workspace/discussions-workspace.adapter";
import typescriptThumbnail from "./assets/course-thumbnails/typescript-960.webp";
import nodeThumbnail from "./assets/course-thumbnails/nodejs-960.webp";
import veolmsThumbnail from "./assets/learning-thumbnails/veolms-course.webp";

const creatorCourses = [
  {
    title: "The Ultimate TypeScript Course",
    thumbnail: typescriptThumbnail,
    status: "Published",
    students: "1,246",
    progress: 64,
  },
  {
    title: "Complete Backend with Node.js",
    thumbnail: nodeThumbnail,
    status: "Published",
    students: "987",
    progress: 58,
  },
  {
    title: "Building VeoLMS: Idea to Production",
    thumbnail: veolmsThumbnail,
    status: "Published",
    students: "653",
    progress: 71,
  },
];

type EnrollmentRow = readonly [
  student: string,
  course: string,
  amount: string,
  time: string,
  avatar: string,
];
type ActivityRow = readonly [
  label: string,
  value: string,
  icon: Icon,
  tone: string,
];
interface DashboardPanelProps {
  className?: string;
  title: string;
  action?: string;
  onAction?: () => void;
  infoLabel?: string;
  children: ReactNode;
}

interface DataCanvasProps {
  kind: "revenue" | "activity";
  label: string;
  themeKey?: string;
  revenueTrend?: DashboardRevenueOverview["trend"];
  revenueCurrency?: string;
  revenueStatus?: "loading" | "empty" | "error";
  activityBuckets?: DashboardSummaryResponse["learningActivity"]["enrollmentActivity"]["buckets"];
  activityStatus?: "loading" | "empty" | "error";
}

const EMPTY_REVENUE_TREND: DashboardRevenueOverview["trend"] = [];
const EMPTY_ACTIVITY_BUCKETS: DashboardSummaryResponse["learningActivity"]["enrollmentActivity"]["buckets"] =
  [];

interface NavigateProps {
  onNavigatePage?: (page: string) => void;
}

interface CreatorDashboardProps extends NavigateProps {
  academyTheme?: string;
}

const recentEnrollments: readonly EnrollmentRow[] = [
  [
    "Aman Yadav",
    "The Ultimate TypeScript Course",
    "₹999",
    "15m ago",
    "/assets/ethan-avatar-160.webp",
  ],
  [
    "Pooja Sharma",
    "Complete Backend with Node.js",
    "₹1,299",
    "1h ago",
    "/assets/sofia-avatar-160.webp",
  ],
  [
    "Vivek Reddy",
    "The Ultimate TypeScript Course",
    "₹999",
    "2h ago",
    "/assets/ethan-avatar-160.webp",
  ],
  [
    "Neha Patel",
    "Building VeoLMS: Idea to Production",
    "₹1,499",
    "3h ago",
    "/assets/sofia-avatar-160.webp",
  ],
  [
    "Arjun Mehta",
    "Complete Backend with Node.js",
    "₹1,299",
    "4h ago",
    "/assets/ethan-avatar-160.webp",
  ],
];

const metricCards = [
  {
    label: "Revenue This Month",
    value: "₹1,24,500",
    change: "12.4%",
    context: "vs last month",
    icon: CurrencyInr,
    tone: "violet",
  },
  {
    label: "Total Students",
    value: "2,486",
    change: "+84",
    context: "this month",
    icon: Users,
    tone: "blue",
  },
  {
    label: "Active Learners (7d)",
    value: "327",
    change: "8.1%",
    context: "vs last 7 days",
    icon: Pulse,
    tone: "green",
  },
  {
    label: "Watch Time This Month",
    value: "1,284 hrs",
    change: "10.2%",
    context: "vs last month",
    icon: Clock,
    tone: "gold",
  },
];

function Trend({
  value,
  negative = false,
}: {
  value: string;
  negative?: boolean;
}) {
  const Icon = negative ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={`creator-trend ${negative ? "is-negative" : ""}`}>
      <Icon size={14} weight="bold" /> {value}
    </span>
  );
}

function RevenueMetricTrend({
  changePercent,
  refunds = false,
}: {
  changePercent: number | null;
  refunds?: boolean;
}) {
  if (changePercent === null) {
    return <span className="creator-trend is-neutral">No comparison</span>;
  }

  const isNeutral = changePercent === 0;
  const isNegative = refunds ? changePercent > 0 : changePercent < 0;
  const Icon = changePercent < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <span
      className={`creator-trend ${isNegative ? "is-negative" : ""} ${
        isNeutral ? "is-neutral" : ""
      }`}
    >
      <Icon size={14} weight="bold" /> {Math.abs(changePercent).toFixed(1)}%
    </span>
  );
}

function EnrollmentActivityComparison({
  changePercent,
  unavailable,
}: {
  changePercent: number | null;
  unavailable: boolean;
}) {
  if (unavailable) {
    return <span className="creator-trend is-neutral">—</span>;
  }
  if (changePercent === null) {
    return (
      <span className="creator-trend is-neutral">
        No comparison vs previous 7 days
      </span>
    );
  }

  if (changePercent === 0) {
    return (
      <span className="creator-trend is-neutral">0.0% vs previous 7 days</span>
    );
  }

  const isNegative = changePercent < 0;
  const Icon = isNegative ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={`creator-trend ${isNegative ? "is-negative" : ""}`}>
      <Icon size={14} weight="bold" /> {Math.abs(changePercent).toFixed(1)}% vs
      previous 7 days
    </span>
  );
}

function formatDashboardCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDashboardNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatDashboardPercent(value: number) {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value)}%`;
}

function DashboardPanel({
  className = "",
  title,
  action,
  onAction,
  infoLabel,
  children,
}: DashboardPanelProps) {
  return (
    <section className={`creator-dashboard-panel ${className}`}>
      <header className="creator-panel-heading">
        <h2>{title}</h2>
        <div className="creator-panel-actions">
          {infoLabel && (
            <button
              type="button"
              className="creator-panel-info"
              aria-label={infoLabel}
              title={infoLabel}
            >
              <Info size={16} />
            </button>
          )}
          {action && (
            <button
              type="button"
              className="creator-panel-link"
              onClick={onAction}
            >
              {action} <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function DataCanvas({
  kind,
  label,
  themeKey = "default",
  revenueTrend = EMPTY_REVENUE_TREND,
  revenueCurrency = "INR",
  revenueStatus,
  activityBuckets = EMPTY_ACTIVITY_BUCKETS,
  activityStatus,
}: DataCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d")!;
    const observer = new ResizeObserver(() => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = bounds.width;
      const height = bounds.height;
      const rootStyles = getComputedStyle(document.documentElement);
      const accent =
        rootStyles.getPropertyValue("--accent").trim() || "#8b68ff";
      const muted = rootStyles.getPropertyValue("--muted").trim() || "#919592";
      const track = rootStyles.getPropertyValue("--track").trim() || "#202324";
      context.clearRect(0, 0, width, height);
      context.font = "11px Manrope, sans-serif";

      if (kind === "revenue") {
        if (revenueTrend.length === 0) {
          context.fillStyle = muted;
          context.textAlign = "center";
          context.fillText(
            revenueStatus === "loading"
              ? "Loading revenue data…"
              : revenueStatus === "error"
                ? "Unable to load revenue data."
                : "No revenue data for this period.",
            width / 2,
            height / 2,
          );
          return;
        }

        const values = revenueTrend.map((point) => point.value);
        const left = 29;
        const right = width - 8;
        const top = 14;
        const bottom = height - 23;
        const x = (index: number) =>
          values.length === 1
            ? (left + right) / 2
            : left + (index / (values.length - 1)) * (right - left);
        const maxValue = Math.max(...values, 0);
        const scaleMax = maxValue > 0 ? Math.ceil(maxValue / 4) * 4 : 1;
        const y = (value: number) =>
          bottom - (value / scaleMax) * (bottom - top);
        context.strokeStyle = track;
        context.lineWidth = 1;
        [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
          const mark = scaleMax * ratio;
          context.beginPath();
          context.moveTo(left, y(mark));
          context.lineTo(right, y(mark));
          context.stroke();
        });
        context.beginPath();
        values.forEach((value, index) =>
          index
            ? context.lineTo(x(index), y(value))
            : context.moveTo(x(index), y(value)),
        );
        context.lineTo(right, bottom);
        context.lineTo(left, bottom);
        context.closePath();
        context.fillStyle = accent;
        context.globalAlpha = 0.18;
        context.fill();
        context.globalAlpha = 1;
        context.beginPath();
        values.forEach((value, index) =>
          index
            ? context.lineTo(x(index), y(value))
            : context.moveTo(x(index), y(value)),
        );
        context.strokeStyle = accent;
        context.lineWidth = 2.25;
        context.stroke();
        values.forEach((value, index) => {
          context.beginPath();
          context.arc(x(index), y(value), 2.5, 0, Math.PI * 2);
          context.fillStyle = accent;
          context.fill();
        });
        context.fillStyle = muted;
        context.textAlign = "right";
        [1, 0.8, 0.6, 0.4, 0.2, 0].forEach((ratio) => {
          const mark = scaleMax * ratio;
          context.fillText(
            new Intl.NumberFormat(
              revenueCurrency === "INR" ? "en-IN" : "en-US",
              { notation: "compact", maximumFractionDigits: 1 },
            ).format(mark),
            left - 6,
            y(mark) + 3,
          );
        });
        const labelCount = Math.min(7, revenueTrend.length);
        const dateLabels = Array.from({ length: labelCount }, (_, labelIndex) => {
          const index =
            labelCount === 1
              ? 0
              : Math.round(
                  (labelIndex * (revenueTrend.length - 1)) /
                    (labelCount - 1),
                );
          return [
            index,
            new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
            }).format(new Date(`${revenueTrend[index]!.date}T00:00:00Z`)),
          ] as const;
        });
        context.globalAlpha = 0.84;
        dateLabels.forEach(([index, dateLabel], labelIndex) => {
          context.textAlign =
            labelIndex === 0
              ? "left"
              : labelIndex === dateLabels.length - 1
                ? "right"
                : "center";
          context.fillText(dateLabel, x(index), height - 5);
        });
        context.globalAlpha = 1;
        context.save();
        context.shadowColor = accent;
        context.shadowBlur = 9;
        context.beginPath();
        context.arc(
          x(values.length - 1),
          y(values.at(-1)!),
          3.4,
          0,
          Math.PI * 2,
        );
        context.fillStyle = accent;
        context.fill();
        context.restore();
      } else {
        if (activityBuckets.length === 0) {
          context.fillStyle = muted;
          context.textAlign = "center";
          context.fillText(
            activityStatus === "loading"
              ? "Loading enrollment activity…"
              : activityStatus === "error"
                ? "Unable to load enrollment activity."
                : "No enrollment activity for this period.",
            width / 2,
            height / 2,
          );
          return;
        }

        const values = activityBuckets.map((bucket) => bucket.value);
        const left = 20;
        const right = width - 8;
        const top = 12;
        const bottom = height - 22;
        const maxValue = Math.max(...values, 0);
        const max = maxValue > 0 ? Math.ceil(maxValue / 4) * 4 : 1;
        context.strokeStyle = track;
        context.lineWidth = 1;
        [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
          const mark = max * ratio;
          const y = bottom - (mark / max) * (bottom - top);
          context.beginPath();
          context.moveTo(left, y);
          context.lineTo(right, y);
          context.stroke();
        });
        values.forEach((value, index) => {
          const gap = (right - left) / values.length;
          const barWidth = Math.max(3, gap * 0.46);
          const x = left + index * gap + gap * 0.22;
          const y = bottom - (value / max) * (bottom - top);
          context.fillStyle = accent;
          context.globalAlpha = 0.86;
          context.beginPath();
          context.roundRect(x, y, barWidth, bottom - y, 3);
          context.fill();
          context.globalAlpha = 1;
        });
        context.fillStyle = muted;
        context.textAlign = "right";
        [1, 0.75, 0.5, 0.25, 0].forEach((ratio) => {
          const mark = max * ratio;
          context.fillText(
            String(Math.round(mark)),
            left - 5,
            bottom - (mark / max) * (bottom - top) + 3,
          );
        });
        const dateLabels = activityBuckets
          .map((bucket, index) => ({
            index,
            text: new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "UTC",
            }).format(new Date(bucket.start)),
          }))
          .filter(({ index }) => index % 3 === 0);
        const gap = (right - left) / values.length;
        context.globalAlpha = 0.84;
        dateLabels.forEach(({ index, text }, labelIndex) => {
          const center = left + index * gap + gap / 2;
          context.textAlign =
            labelIndex === 0
              ? "left"
              : labelIndex === dateLabels.length - 1
                ? "right"
                : "center";
          context.fillText(text, center, height - 5);
        });
        context.globalAlpha = 1;
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    activityBuckets,
    activityStatus,
    kind,
    revenueCurrency,
    revenueStatus,
    revenueTrend,
    themeKey,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="creator-chart-canvas"
      role="img"
      aria-label={label}
    />
  );
}

function RevenuePanel({
  range,
  setRange,
  themeKey,
  revenueOverview,
  isLoading,
  isError,
}: {
  range: DashboardRange;
  setRange: (range: DashboardRange) => void;
  themeKey: string;
  revenueOverview?: DashboardRevenueOverview;
  isLoading: boolean;
  isError: boolean;
}) {
  const currency = revenueOverview?.currency ?? "INR";
  const trend = revenueOverview?.trend ?? [];
  const revenueStatus = isLoading
    ? "loading"
    : isError
      ? "error"
      : trend.length === 0
        ? "empty"
        : undefined;
  const summaryUnavailable = isLoading || isError;

  return (
    <DashboardPanel className="creator-revenue-panel" title="Revenue Overview">
      <div className="creator-chart-toolbar">
        <span>
          <i /> Revenue ({currency === "INR" ? "₹" : currency})
        </span>
        <div
          className="creator-range-tabs"
          role="tablist"
          aria-label="Revenue range"
        >
          {(
            [
              ["7d", "7D"],
              ["30d", "30D"],
              ["3m", "3M"],
              ["1y", "1Y"],
            ] as const
          ).map(([option, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={range === option}
              tabIndex={range === option ? 0 : -1}
              className={range === option ? "is-active" : ""}
              key={option}
              onClick={() => setRange(option)}
              onKeyDown={handleRovingTabKeyDown}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="creator-chart creator-chart--revenue">
        <DataCanvas
          kind="revenue"
          themeKey={themeKey}
          label="Revenue trend for the selected period"
          revenueTrend={trend}
          revenueCurrency={currency}
          revenueStatus={revenueStatus}
        />
      </div>
      <div className="creator-revenue-summary">
        <div>
          <span>Gross Sales</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardCurrency(revenueOverview?.grossSales.value ?? 0, currency)}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.grossSales.changePercent ?? null}
          />
        </div>
        <div>
          <span>Net Revenue</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardCurrency(revenueOverview?.netRevenue.value ?? 0, currency)}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.netRevenue.changePercent ?? null}
          />
        </div>
        <div>
          <span>Orders</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardNumber(revenueOverview?.orders.value ?? 0)}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.orders.changePercent ?? null}
          />
        </div>
        <div>
          <span>Refunds</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardNumber(revenueOverview?.refunds.value ?? 0)}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.refunds.changePercent ?? null}
            refunds
          />
        </div>
      </div>
    </DashboardPanel>
  );
}

function LearningActivityPanel({
  themeKey,
  learningActivity,
  isLoading,
  isError,
}: {
  themeKey: string;
  learningActivity?: DashboardSummaryResponse["learningActivity"];
  isLoading: boolean;
  isError: boolean;
}) {
  const summaryUnavailable = isLoading || isError;
  const rows: readonly ActivityRow[] = [
    [
      "Avg. Course Progress",
      summaryUnavailable
        ? "—"
        : formatDashboardPercent(
            learningActivity?.averageCourseProgress.value ?? 0,
          ),
      ChartLineUp,
      "blue",
    ],
    [
      "Course Completion Rate",
      summaryUnavailable
        ? "—"
        : formatDashboardPercent(
            learningActivity?.courseCompletionRate.value ?? 0,
          ),
      CheckCircle,
      "green",
    ],
    [
      "New Enrollments",
      summaryUnavailable
        ? "—"
        : formatDashboardNumber(learningActivity?.newEnrollments.value ?? 0),
      PlusCircle,
      "violet",
    ],
  ];
  const activityBuckets = summaryUnavailable
    ? []
    : (learningActivity?.enrollmentActivity.buckets ?? []);
  const activityStatus = isLoading
    ? "loading"
    : isError
      ? "error"
      : activityBuckets.length === 0
        ? "empty"
        : undefined;
  const activityComparison = learningActivity?.enrollmentActivity;

  return (
    <DashboardPanel
      className="creator-activity-panel"
      title="Learning Activity"
      infoLabel="About learning activity"
    >
      <div className="creator-activity-list">
        {rows.map(([label, value, Icon, tone]) => (
          <div className="creator-activity-row" key={label}>
            <span className={`creator-icon-circle tone-${tone}`}>
              <Icon size={18} weight="duotone" />
            </span>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="creator-chart-toolbar creator-activity-toolbar">
        <span>
          <i /> Enrollment Activity
        </span>
        <EnrollmentActivityComparison
          changePercent={activityComparison?.changePercent ?? null}
          unavailable={summaryUnavailable}
        />
      </div>
      <div className="creator-chart creator-chart--activity">
        <DataCanvas
          kind="activity"
          themeKey={themeKey}
          label="New enrollments over the last 7 days in UTC 8-hour buckets"
          activityBuckets={activityBuckets}
          activityStatus={activityStatus}
        />
      </div>
      <p className="creator-activity-meta">Last 7 days · 8h buckets · UTC</p>
    </DashboardPanel>
  );
}

function CoursesPanel({ onNavigatePage }: NavigateProps) {
  return (
    <DashboardPanel
      className="creator-courses-panel"
      title="Your Courses"
      action="View all"
      onAction={() => onNavigatePage?.("courses")}
    >
      <div className="creator-table creator-courses-table">
        <div className="creator-table-head">
          <span>Course</span>
          <span>Status</span>
          <span>Students</span>
          <span>Avg Progress</span>
        </div>
        {creatorCourses.map((course) => (
          <div className="creator-table-row" key={course.title}>
            <span className="creator-course-cell">
              <img
                src={course.thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <strong>{course.title}</strong>
            </span>
            <span>
              <em className="creator-published">{course.status}</em>
            </span>
            <span>{course.students}</span>
            <span className="creator-progress-cell">
              <span>{course.progress}%</span>
              <i>
                <b style={{ width: `${course.progress}%` }} />
              </i>
            </span>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}

function getDiscussionActivityLabel(kind: string) {
  switch (kind) {
    case "question":
    case "qna":
      return "asked a question";
    case "comment":
      return "commented";
    case "note":
      return "added a note";
    default:
      return "started a discussion";
  }
}

function CreatorDiscussionAvatar({ src }: { src?: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span className="creator-discussion-avatar" aria-hidden="true">
      {src && !imageFailed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            setImageFailed(true);
          }}
        />
      ) : (
        <UserCircle className="creator-discussion-avatar-icon" weight="duotone" />
      )}
    </span>
  );
}

function DiscussionsPanel({ onNavigatePage }: NavigateProps) {
  const {
    data: discussionsResponse,
    isLoading,
    isError,
  } = useDashboardRecentDiscussions();
  const discussionCards =
    discussionsResponse?.items.map((item) => ({
      ...adaptDiscussionWorkspaceItem(item),
      activityLabel: getDiscussionActivityLabel(item.kind),
    })) ?? [];

  return (
    <DashboardPanel
      className="creator-discussions-panel"
      title="Recent Discussions"
      action="View all"
      onAction={() => onNavigatePage?.("Discussions")}
    >
      <div className="creator-discussion-list">
        {isLoading ? (
          <p role="status">Loading recent discussions…</p>
        ) : isError ? (
          <p role="alert">Unable to load recent discussions.</p>
        ) : discussionCards.length === 0 ? (
          <p>No recent discussions.</p>
        ) : (
          discussionCards.map((item) => (
            <article key={item.id}>
              <CreatorDiscussionAvatar src={item.avatar} />
              <div>
                <strong>
                  {item.author} {item.activityLabel}
                </strong>
                {item.course && <small>{item.course}</small>}
                {item.lesson && <small>{item.lesson}</small>}
                <p>{item.excerpt}</p>
              </div>
              <time>{item.activity}</time>
              <button
                type="button"
                onClick={() => onNavigatePage?.("Discussions")}
              >
                View
              </button>
            </article>
          ))
        )}
      </div>
    </DashboardPanel>
  );
}

function EnrollmentsPanel({ onNavigatePage }: NavigateProps) {
  return (
    <DashboardPanel
      className="creator-enrollments-panel"
      title="Recent Enrollments"
      action="View all"
      onAction={() => onNavigatePage?.("Students")}
    >
      <div className="creator-table creator-enrollment-table">
        <div className="creator-table-head">
          <span>Student</span>
          <span>Course</span>
          <span>Amount</span>
          <span>Time</span>
        </div>
        {recentEnrollments.map(([student, course, amount, time, avatar]) => (
          <div className="creator-table-row" key={`${student}-${time}`}>
            <span className="creator-student-cell">
              <img src={avatar} alt="" />
              <strong>{student}</strong>
            </span>
            <span>{course}</span>
            <span>{amount}</span>
            <span>{time}</span>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}

export function CreatorDashboard({
  onNavigatePage,
  academyTheme = "default",
}: CreatorDashboardProps) {
  const [range, setRange] = useState<DashboardRange>("30d");
  const {
    data: dashboardResponse,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
  } =
    useDashboard(range);

  useEffect(() => {
    if (import.meta.env.DEV && dashboardResponse) {
      console.debug(
        "[CreatorDashboard][SS1] dashboard response",
        dashboardResponse,
      );
    }
  }, [dashboardResponse]);

  return (
    <div className="creator-dashboard">
      <header className="creator-dashboard-heading">
        <div>
          <h1>
            Good afternoon, Anurag <span aria-hidden="true">👋</span>
          </h1>
          <p>Here&apos;s what&apos;s happening with your academy today.</p>
        </div>
        <div className="creator-dashboard-actions">
          <button
            type="button"
            className="creator-primary-action"
            onClick={() => onNavigatePage?.("Create Course")}
          >
            <Plus size={18} /> Create Course
          </button>
          <button
            type="button"
            className="creator-outline-action"
            onClick={() => onNavigatePage?.("Analytics")}
          >
            <ChartBar size={17} /> View Analytics
          </button>
        </div>
      </header>

      <section className="creator-kpi-grid" aria-label="Academy overview">
        {metricCards.map(
          ({ label, value, change, context, icon: Icon, tone }) => (
            <article className="creator-kpi-card" key={label}>
              <span className={`creator-icon-circle tone-${tone}`}>
                <Icon size={22} weight="duotone" />
              </span>
              <div>
                <small>{label}</small>
                <strong>{value}</strong>
                <span className="creator-kpi-footer">
                  <Trend value={change} />
                  <span className="creator-kpi-context">{context}</span>
                </span>
              </div>
            </article>
          ),
        )}
      </section>

      <div className="creator-dashboard-grid">
        <RevenuePanel
          range={range}
          setRange={setRange}
          themeKey={academyTheme}
          revenueOverview={dashboardResponse?.revenueOverview}
          isLoading={isDashboardLoading}
          isError={isDashboardError}
        />
        <LearningActivityPanel
          themeKey={academyTheme}
          learningActivity={dashboardResponse?.learningActivity}
          isLoading={isDashboardLoading}
          isError={isDashboardError}
        />
        <CoursesPanel onNavigatePage={onNavigatePage} />
        <DiscussionsPanel onNavigatePage={onNavigatePage} />
        <EnrollmentsPanel onNavigatePage={onNavigatePage} />
      </div>
    </div>
  );
}
