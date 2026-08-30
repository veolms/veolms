import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownRightIcon as ArrowDownRight } from "@phosphor-icons/react/ArrowDownRight";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PlusCircleIcon as PlusCircle } from "@phosphor-icons/react/PlusCircle";
import { PulseIcon as Pulse } from "@phosphor-icons/react/Pulse";
import { TicketIcon as Ticket } from "@phosphor-icons/react/Ticket";
import { UserListIcon as UserList } from "@phosphor-icons/react/UserList";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { Icon } from "@phosphor-icons/react";
import { handleRovingTabKeyDown } from "./accessibility/rovingTabFocus";
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
    watch: "642 hrs",
    rating: "4.8",
  },
  {
    title: "Complete Backend with Node.js",
    thumbnail: nodeThumbnail,
    status: "Published",
    students: "987",
    progress: 58,
    watch: "412 hrs",
    rating: "4.7",
  },
  {
    title: "Building VeoLMS: Idea to Production",
    thumbnail: veolmsThumbnail,
    status: "Published",
    students: "653",
    progress: 71,
    watch: "230 hrs",
    rating: "4.9",
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
  change: string,
  icon: Icon,
  tone: string,
];
type QuickAction = readonly [
  title: string,
  detail: string,
  icon: Icon,
  tone: string,
  notice: string,
  destination?: string,
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
}

interface NavigateProps {
  onNavigatePage?: (page: string) => void;
}

interface CreatorDashboardProps extends NavigateProps {
  setNotice?: (notice: string) => void;
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

const discussions = [
  {
    name: "Rahul Kumar asked a question",
    course: "The Ultimate TypeScript Course",
    lesson: "Lecture 24: Generics Deep Dive",
    body: "I'm confused about the constraint in generic functions...",
    time: "10m ago",
    action: "Reply",
    avatar: "/assets/ethan-avatar-160.webp",
  },
  {
    name: "Sneha Verma commented",
    course: "Complete Backend with Node.js",
    lesson: "Lecture 15: Authentication with JWT",
    body: "Great explanation! Could you also cover refresh tokens?",
    time: "1h ago",
    action: "View",
    avatar: "/assets/sofia-avatar-160.webp",
  },
  {
    name: "Discussion has 3 new replies",
    course: "Building VeoLMS: Idea to Production",
    lesson: "Lecture 68: File Upload & Storage",
    body: "There's an issue when uploading large files on S3...",
    time: "2h ago",
    action: "View thread",
    avatar: "/assets/ethan-avatar-160.webp",
  },
];

const attentionItems = [
  {
    title: "14 unanswered questions",
    detail: "Students are waiting for your response.",
    action: "View all",
    icon: WarningCircle,
    tone: "danger",
  },
  {
    title: "Lecture 68 has high drop-off",
    detail: "65% of learners left in the last 10 minutes.",
    action: "View insights",
    icon: ChartBar,
    tone: "gold",
  },
  {
    title: "3 refund requests",
    detail: "Requires your review and action.",
    action: "Review",
    icon: ArrowsClockwise,
    tone: "blue",
  },
  {
    title: "7 students stalled this week",
    detail: "Help them get back on track.",
    action: "View students",
    icon: Users,
    tone: "violet",
  },
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

function DataCanvas({ kind, label, themeKey = "default" }: DataCanvasProps) {
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
        const values = [
          24, 38, 42, 36, 45, 53, 44, 33, 35, 49, 47, 43, 57, 64, 61, 70, 88,
          96, 79, 81, 75, 78, 85, 97,
        ];
        const left = 29;
        const right = width - 8;
        const top = 14;
        const bottom = height - 23;
        const x = (index: number) =>
          left + (index / (values.length - 1)) * (right - left);
        const y = (value: number) => bottom - (value / 100) * (bottom - top);
        context.strokeStyle = track;
        context.lineWidth = 1;
        [0, 25, 50, 75, 100].forEach((mark) => {
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
        [100, 80, 60, 40, 20, 0].forEach((mark) =>
          context.fillText(
            mark === 0 ? "0" : `${mark}K`,
            left - 6,
            y(mark) + 3,
          ),
        );
        const dateLabels: readonly (readonly [number, string])[] = [
          [0, "May 6"],
          [4, "May 11"],
          [8, "May 16"],
          [12, "May 21"],
          [16, "May 26"],
          [20, "May 31"],
          [23, "Jun 4"],
        ];
        context.globalAlpha = 0.84;
        dateLabels.forEach(([index, text], labelIndex) => {
          context.textAlign =
            labelIndex === 0
              ? "left"
              : labelIndex === dateLabels.length - 1
                ? "right"
                : "center";
          context.fillText(text, x(index), height - 5);
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
        const values = [
          62, 88, 71, 110, 52, 65, 42, 84, 58, 104, 60, 35, 41, 128, 74, 49,
          104, 63, 111, 94, 99, 66, 137, 57, 119, 71,
        ];
        const left = 20;
        const right = width - 8;
        const top = 12;
        const bottom = height - 22;
        const max = 150;
        context.strokeStyle = track;
        context.lineWidth = 1;
        [0, 50, 100, 150].forEach((mark) => {
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
        [150, 100, 50, 0].forEach((mark) =>
          context.fillText(
            String(mark),
            left - 5,
            bottom - (mark / max) * (bottom - top) + 3,
          ),
        );
        const dateLabels: readonly (readonly [number, string])[] = [
          [0, "May 6"],
          [5, "May 11"],
          [9, "May 16"],
          [13, "May 21"],
          [17, "May 26"],
          [21, "May 31"],
          [25, "Jun 4"],
        ];
        const gap = (right - left) / values.length;
        context.globalAlpha = 0.84;
        dateLabels.forEach(([index, text], labelIndex) => {
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
  }, [kind, themeKey]);

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
}: {
  range: string;
  setRange: (range: string) => void;
  themeKey: string;
}) {
  return (
    <DashboardPanel className="creator-revenue-panel" title="Revenue Overview">
      <div className="creator-chart-toolbar">
        <span>
          <i /> Revenue (₹)
        </span>
        <div
          className="creator-range-tabs"
          role="tablist"
          aria-label="Revenue range"
        >
          {["7D", "30D", "3M", "1Y"].map((option) => (
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
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="creator-chart creator-chart--revenue">
        <DataCanvas
          kind="revenue"
          themeKey={themeKey}
          label="Revenue trend for the selected period"
        />
      </div>
      <div className="creator-revenue-summary">
        <div>
          <span>Gross Sales</span>
          <strong>₹1,56,300</strong>
          <Trend value="13.7%" />
        </div>
        <div>
          <span>Net Revenue</span>
          <strong>₹1,24,500</strong>
          <Trend value="12.4%" />
        </div>
        <div>
          <span>Orders</span>
          <strong>512</strong>
          <Trend value="9.3%" />
        </div>
        <div>
          <span>Refunds</span>
          <strong>12</strong>
          <Trend value="7.7%" negative />
        </div>
      </div>
    </DashboardPanel>
  );
}

function LearningActivityPanel({ themeKey }: { themeKey: string }) {
  const rows: readonly ActivityRow[] = [
    ["Active Learners", "327", "8.1%", Users, "violet"],
    ["Avg. Course Progress", "61%", "3.6%", ChartLineUp, "blue"],
    ["Lecture Completion Rate", "68%", "5.2%", CheckCircle, "green"],
    ["Watch Time (This Month)", "1,284 hrs", "10.2%", Clock, "gold"],
  ];
  return (
    <DashboardPanel
      className="creator-activity-panel"
      title="Learning Activity"
      infoLabel="About learning activity"
    >
      <div className="creator-activity-list">
        {rows.map(([label, value, change, Icon, tone]) => (
          <div className="creator-activity-row" key={label}>
            <span className={`creator-icon-circle tone-${tone}`}>
              <Icon size={18} weight="duotone" />
            </span>
            <span>{label}</span>
            <strong>{value}</strong>
            <Trend value={change} />
          </div>
        ))}
      </div>
      <div className="creator-chart creator-chart--activity">
        <DataCanvas
          kind="activity"
          themeKey={themeKey}
          label="Learning activity bar chart"
        />
      </div>
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
          <span>
            Watch Hrs
            <br />
            (This Month)
          </span>
          <span>Rating</span>
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
            <span>{course.watch}</span>
            <span>
              {course.rating} <b className="creator-rating">★</b>
            </span>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}

function DiscussionsPanel({ onNavigatePage }: NavigateProps) {
  return (
    <DashboardPanel
      className="creator-discussions-panel"
      title="Recent Discussions"
      action="View all"
      onAction={() => onNavigatePage?.("Discussions")}
    >
      <div className="creator-discussion-list">
        {discussions.map((item) => (
          <article key={item.name}>
            <img src={item.avatar} alt="" />
            <div>
              <strong>{item.name}</strong>
              <small>{item.course}</small>
              <small>{item.lesson}</small>
              <p>{item.body}</p>
            </div>
            <time>{item.time}</time>
            <button
              type="button"
              onClick={() => onNavigatePage?.("Discussions")}
            >
              {item.action}
            </button>
            <i />
          </article>
        ))}
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

function AttentionPanel({
  setNotice,
}: {
  setNotice?: (notice: string) => void;
}) {
  return (
    <DashboardPanel
      className="creator-attention-panel"
      title="Needs Your Attention"
    >
      <div className="creator-attention-list">
        {attentionItems.map(({ title, detail, action, icon: Icon, tone }) => (
          <button
            type="button"
            key={title}
            onClick={() =>
              setNotice?.(`${action} selected for ${title.toLowerCase()}.`)
            }
          >
            <span className={`creator-icon-circle tone-${tone}`}>
              <Icon size={19} weight="duotone" />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <em>{action}</em>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
    </DashboardPanel>
  );
}

function QuickActions({
  onNavigatePage,
  setNotice,
}: NavigateProps & { setNotice?: (notice: string) => void }) {
  const actions: readonly QuickAction[] = [
    [
      "Create Course",
      "Build a new course",
      PlusCircle,
      "violet",
      "Create Course selected. The course editor will be added later.",
      "Create Course",
    ],
    [
      "Add Lecture",
      "Upload or create content",
      VideoCamera,
      "blue",
      "Add Lecture selected. Lecture authoring will be added later.",
    ],
    [
      "Manage Coupons",
      "Create or edit coupons",
      Ticket,
      "green",
      "Manage Coupons selected. Coupon management will be added later.",
    ],
    [
      "View Students",
      "Manage your learners",
      UserList,
      "gold",
      "View Students selected. Student management will be added later.",
    ],
  ];
  return (
    <DashboardPanel className="creator-quick-panel" title="Quick Actions">
      <div className="creator-quick-grid">
        {actions.map(([title, detail, Icon, tone, notice, destination]) => (
          <button
            type="button"
            key={title}
            onClick={() =>
              destination ? onNavigatePage?.(destination) : setNotice?.(notice)
            }
          >
            <span className={`creator-icon-circle tone-${tone}`}>
              <Icon size={20} weight="duotone" />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
    </DashboardPanel>
  );
}

export function CreatorDashboard({
  onNavigatePage,
  setNotice,
  academyTheme = "default",
}: CreatorDashboardProps) {
  const [range, setRange] = useState("30D");
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
        />
        <LearningActivityPanel themeKey={academyTheme} />
        <CoursesPanel onNavigatePage={onNavigatePage} />
        <DiscussionsPanel onNavigatePage={onNavigatePage} />
        <EnrollmentsPanel onNavigatePage={onNavigatePage} />
        <AttentionPanel setNotice={setNotice} />
        <QuickActions onNavigatePage={onNavigatePage} setNotice={setNotice} />
      </div>
    </div>
  );
}
