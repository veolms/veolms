import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpen } from "@phosphor-icons/react/BookOpen";
import { Certificate } from "@phosphor-icons/react/Certificate";
import { ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { Clock } from "@phosphor-icons/react/Clock";
import { Fire } from "@phosphor-icons/react/Fire";
import { GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { Heart } from "@phosphor-icons/react/Heart";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Medal } from "@phosphor-icons/react/Medal";
import { Play } from "@phosphor-icons/react/Play";
import { Target } from "@phosphor-icons/react/Target";
import type { Icon } from "@phosphor-icons/react";
import { ThemedSelect } from "./ThemedSelect";
import { handleRovingTabKeyDown } from "./accessibility/rovingTabFocus";
import javascriptThumbnail from "./assets/course-thumbnails/javascript-960.webp";
import typescriptThumbnail from "./assets/course-thumbnails/typescript-960.webp";
import nodeThumbnail from "./assets/course-thumbnails/nodejs-960.webp";
import mongodbThumbnail from "./assets/course-thumbnails/mongodb-960.webp";
import awsThumbnail from "./assets/course-thumbnails/aws-960.webp";
import typescriptInstructorHero from "./assets/learning-thumbnails/typescript-instructor-hero.webp";
import veolmsThumbnail from "./assets/learning-thumbnails/veolms-course.webp";
import illustratorThumbnail from "./assets/learning-thumbnails/illustrator-course.webp";
import reactThumbnail from "./assets/learning-thumbnails/react-course.webp";
import d3Thumbnail from "./assets/learning-thumbnails/d3-course.webp";
import {
  isStoredString,
  useSessionStorageState,
} from "./learning/useSessionStorageState";

export interface LearningCourse {
  id: string;
  title: string;
  sections: number;
  lectures: number;
  status: "in-progress" | "not-started" | "completed";
  progress: number;
  lastLesson?: string;
  accessed?: string;
  enrolledOn?: string;
  completedOn?: string;
  thumbnail: string;
}

interface NavigationCallbacks {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  studentName?: string;
}

interface SectionHeaderProps {
  icon: Icon;
  title: string;
  action?: string;
  onAction?: () => void;
}

interface ProgressBarProps {
  value: number;
  completed?: boolean;
}

interface LearningCourseCardProps {
  course: LearningCourse;
  wishlisted: boolean;
  onWishlist: (courseId: string) => void;
  onOpen: (course: LearningCourse) => void;
  setNotice: (notice: string) => void;
  imagePriority?: boolean;
}

interface MyCoursesPageProps {
  onOpenCourse: (course: LearningCourse) => void;
  wishlisted: ReadonlySet<string>;
  onWishlist: (courseId: string) => void;
  setNotice: (notice: string) => void;
}

const learningCourses: readonly LearningCourse[] = [
  {
    id: "typescript-course",
    title: "The Ultimate TypeScript Course",
    sections: 24,
    lectures: 160,
    status: "in-progress",
    progress: 52,
    lastLesson: "Conditional Types",
    accessed: "2h ago",
    thumbnail: typescriptThumbnail,
  },
  {
    id: "javascript-course",
    title: "The Complete JavaScript Course",
    sections: 20,
    lectures: 142,
    status: "in-progress",
    progress: 38,
    lastLesson: "Closures and the Event Loop",
    accessed: "4h ago",
    thumbnail: javascriptThumbnail,
  },
  {
    id: "backend-nodejs",
    title: "Complete Backend with Node.js",
    sections: 23,
    lectures: 185,
    status: "in-progress",
    progress: 76,
    lastLesson: "Error Handling in Express",
    accessed: "1d ago",
    thumbnail: nodeThumbnail,
  },
  {
    id: "building-veolms",
    title: "Building VeoLMS: Idea to Production",
    sections: 18,
    lectures: 128,
    status: "in-progress",
    progress: 21,
    lastLesson: "Project Overview",
    accessed: "3d ago",
    thumbnail: veolmsThumbnail,
  },
  {
    id: "mongodb-database-design",
    title: "MongoDB & Database Design",
    sections: 12,
    lectures: 68,
    status: "not-started",
    progress: 0,
    enrolledOn: "Aug 02, 2026",
    thumbnail: mongodbThumbnail,
  },
  {
    id: "illustrator-designers",
    title: "Adobe Illustrator for UI Designers",
    sections: 10,
    lectures: 55,
    status: "completed",
    progress: 100,
    completedOn: "Jul 18, 2026",
    thumbnail: illustratorThumbnail,
  },
  {
    id: "advanced-react",
    title: "Advanced React Development",
    sections: 15,
    lectures: 92,
    status: "in-progress",
    progress: 64,
    lastLesson: "Context API Deep Dive",
    accessed: "5h ago",
    thumbnail: reactThumbnail,
  },
  {
    id: "data-visualization-d3",
    title: "Data Visualization with D3.js",
    sections: 9,
    lectures: 36,
    status: "not-started",
    progress: 0,
    enrolledOn: "Jul 28, 2026",
    thumbnail: d3Thumbnail,
  },
  {
    id: "aws-cloud-practitioner",
    title: "AWS Cloud Practitioner Essentials",
    sections: 11,
    lectures: 60,
    status: "in-progress",
    progress: 48,
    lastLesson: "IAM Basics",
    accessed: "2d ago",
    thumbnail: awsThumbnail,
  },
];

const LEGACY_MY_COURSES_SEARCH_KEYS = ["veolms-my-learning-search"] as const;

const resumeLessons = [
  { number: 84, title: "Conditional Types", duration: "18:35", active: true },
  { number: 85, title: "Mapped Types Deep Dive", duration: "22:10" },
  { number: 86, title: "Template Literal Types", duration: "16:40" },
];

const progressMetrics = [
  { value: "2", label: "Active Courses", icon: BookOpen, tone: "violet" },
  {
    value: "12",
    label: "Lectures Completed This Week",
    icon: CheckCircle,
    tone: "green",
  },
  {
    value: "4h 28m",
    label: "Learning Time This Week",
    icon: Clock,
    tone: "cyan",
  },
  { value: "7", label: "Day Streak", icon: ChartLineUp, tone: "gold" },
];

function SectionHeader({
  icon: Icon,
  title,
  action,
  onAction,
}: SectionHeaderProps) {
  return (
    <div className="dashboard-section-heading">
      <h2>
        <Icon size={19} weight="duotone" /> {title}
      </h2>
      {action && (
        <button type="button" onClick={onAction}>
          {action} <ArrowRight size={17} />
        </button>
      )}
    </div>
  );
}

function ProgressBar({ value, completed = false }: ProgressBarProps) {
  return (
    <span
      className={`learning-progress-track ${completed ? "is-complete" : ""}`}
      aria-hidden="true"
    >
      <span style={{ width: `${value}%` }} />
    </span>
  );
}

export function StudentHome({
  onOpenCourse,
  onNavigatePage,
  studentName,
}: NavigationCallbacks) {
  const currentCourse = learningCourses.find(
    ({ id }) => id === "typescript-course",
  )!;
  const continueCourses = [
    learningCourses.find(({ id }) => id === "javascript-course")!,
    learningCourses.find(({ id }) => id === "backend-nodejs")!,
  ];
  const recentlyUpdatedCourses = [
    currentCourse,
    learningCourses.find(({ id }) => id === "backend-nodejs")!,
  ];
  const goalCompletion = 72;
  const firstName =
    (studentName?.trim() || "Ashi Singh").split(/\s+/)[0] || "Ashi";

  return (
    <div className="student-home">
      <header className="home-greeting-row">
        <div>
          <h1>
            Good evening, {firstName}{" "}
            <span className="home-wave" aria-hidden="true">
              👋
            </span>
          </h1>
          <p>Ready to continue your learning journey?</p>
        </div>
        <div
          className="home-goal-summary"
          aria-label={`7 day streak and 2.1 of 3 learning hours completed today (${goalCompletion}% complete)`}
        >
          <div>
            <Fire size={33} weight="fill" />
            <span>
              <strong>7</strong>
              <small>Day Streak</small>
            </span>
          </div>
          <div>
            <span>
              <small>Today&apos;s Goal</small>
              <strong>2.1 / 3 hrs</strong>
            </span>
            <i
              className="home-goal-ring"
              style={
                { "--goal-progress": `${goalCompletion}%` } as CSSProperties
              }
              aria-hidden="true"
            >
              <span>{goalCompletion}%</span>
            </i>
          </div>
        </div>
      </header>

      <section
        className="home-resume-card"
        aria-labelledby="continue-learning-title"
      >
        <div className="home-resume-layout">
          <div className="home-resume-visual">
            <img
              src={typescriptInstructorHero}
              alt="TypeScript instructor pointing toward the TS course mark"
              width={1600}
              height={900}
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <div className="home-resume-copy">
            <span className="learning-status in-progress">In Progress</span>
            <h2 id="continue-learning-title">The Ultimate TypeScript Course</h2>
            <strong>
              Section 12 <i /> Advanced Generics
            </strong>
            <p>Lecture 84: Conditional Types</p>
            <div className="home-resume-progress">
              <ProgressBar value={52} />
              <span>52%</span>
            </div>
            <button
              type="button"
              className="primary-learning-action"
              onClick={() => onOpenCourse(currentCourse)}
            >
              <Play size={18} weight="fill" /> Continue Learning
            </button>
          </div>
          <div className="home-resume-list">
            <h3>Resume from</h3>
            {resumeLessons.map((lesson) => (
              <button
                key={lesson.number}
                type="button"
                className={lesson.active ? "is-active" : ""}
                onClick={() => onOpenCourse(currentCourse)}
              >
                <span className="resume-play">
                  <Play size={14} weight="fill" />
                </span>
                <span>
                  <small>Lecture {lesson.number}</small>
                  <strong>{lesson.title}</strong>
                </span>
                <time>{lesson.duration}</time>
              </button>
            ))}
            <button
              type="button"
              className="resume-view-all"
              onClick={() => onNavigatePage("my-courses")}
            >
              View all in this section <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      <div className="home-dashboard-grid">
        <section className="dashboard-panel home-continue-panel">
          <SectionHeader
            icon={BookOpen}
            title="Continue Learning"
            action="View All"
            onAction={() => onNavigatePage("my-courses")}
          />
          <div className="home-mini-course-grid">
            {continueCourses.map((course) => (
              <article key={course.id} className="home-mini-course">
                <img
                  src={course.thumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <div>
                  <h3>{course.title}</h3>
                  <p>
                    {course.id === "backend-nodejs"
                      ? "Section 14 · Performance & Optimization"
                      : "Section 8 · Modern JavaScript Patterns"}
                  </p>
                </div>
                <div className="home-mini-progress">
                  <ProgressBar
                    value={
                      course.id === "backend-nodejs" ? 35 : course.progress
                    }
                  />
                  <span>
                    {course.id === "backend-nodejs" ? 35 : course.progress}%
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-learning-action home-mini-action"
                  onClick={() => onOpenCourse(course)}
                >
                  <Play size={16} weight="fill" />
                  <span>Continue Learning</span>
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-panel home-discussions-panel">
          <SectionHeader
            icon={ChatCircleDots}
            title="Recent Discussions"
            action="View All"
            onAction={() => onNavigatePage("discussions")}
          />
          <div className="home-discussion-list">
            <article>
              <img src="/assets/ethan-avatar-160.webp" alt="" />
              <div>
                <strong>
                  Anurag Singh replied to your comment <b>NEW</b>
                </strong>
                <p>
                  “That makes sense! I tried using the keyof operator and it
                  worked perfectly.”
                </p>
                <small>The Ultimate TypeScript Course · Lecture 84</small>
              </div>
              <time>12 min ago</time>
              <i />
            </article>
            <article>
              <span>
                <GraduationCap size={26} weight="duotone" />
              </span>
              <div>
                <strong>Instructor replied to your question</strong>
                <p>
                  “Great question! Remember that conditional types are
                  distributive when used with naked type params.”
                </p>
                <small>The Ultimate TypeScript Course · Lecture 83</small>
              </div>
              <time>2h ago</time>
              <i />
            </article>
            <article>
              <span>
                <ChatCircleDots size={26} weight="duotone" />
              </span>
              <div>
                <strong>3 new replies in PostgreSQL queue discussion</strong>
                <p>
                  Discussion about EXPLAIN ANALYZE and query plans in large
                  datasets.
                </p>
                <small>PostgreSQL Mastery · Lecture 21</small>
              </div>
              <time>1d ago</time>
              <i />
            </article>
          </div>
        </section>

        <section className="dashboard-panel home-progress-panel">
          <SectionHeader
            icon={ChartLineUp}
            title="Your Progress"
            action="View Analytics"
            onAction={() => onNavigatePage("analytics")}
          />
          <div className="home-metrics-grid">
            {progressMetrics.map(({ value, label, icon: Icon, tone }) => (
              <article key={label} className={`home-metric tone-${tone}`}>
                <div className="home-metric__lead">
                  <span>
                    <Icon size={20} weight="duotone" />
                  </span>
                  <strong>{value}</strong>
                </div>
                <p>{label}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-panel home-updates-panel">
          <SectionHeader
            icon={Target}
            title="New in Your Courses"
            action="View All"
            onAction={() => onNavigatePage("my-courses")}
          />
          <div className="home-update-list">
            {recentlyUpdatedCourses.map((course, index) => (
              <button
                type="button"
                key={course.id}
                onClick={() => onOpenCourse(course)}
              >
                <img
                  src={course.thumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span>
                  <strong>{course.title}</strong>
                  <small>
                    {index ? "2 new lectures added" : "3 new lectures added"}
                  </small>
                  <em>
                    {index
                      ? "Section 14: Performance & Optimization"
                      : "Section 18: TypeScript Compiler Internals"}
                  </em>
                </span>
                <time>{index ? "1d ago" : "2h ago"}</time>
                <i aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function LearningCourseCard({
  course,
  wishlisted,
  onWishlist,
  onOpen,
  setNotice,
  imagePriority = false,
}: LearningCourseCardProps) {
  const completed = course.status === "completed";
  const notStarted = course.status === "not-started";
  const statusLabel = completed
    ? "Completed"
    : notStarted
      ? "Not Started"
      : "In Progress";

  return (
    <article className="learning-card">
      <div className="learning-card-media">
        <img
          src={course.thumbnail}
          alt=""
          width={960}
          height={540}
          loading={imagePriority ? "eager" : "lazy"}
          fetchPriority={imagePriority ? "high" : "low"}
          decoding={imagePriority ? "sync" : "async"}
        />
        <span className={`learning-status ${course.status}`}>
          {statusLabel}
        </span>
        <button
          type="button"
          className={`learning-heart ${wishlisted ? "is-active" : ""}`}
          aria-label={
            wishlisted
              ? `Remove ${course.title} from wishlist`
              : `Add ${course.title} to wishlist`
          }
          aria-pressed={wishlisted}
          onClick={() => onWishlist(course.id)}
        >
          <Heart size={24} weight={wishlisted ? "fill" : "regular"} />
        </button>
      </div>
      <div className="learning-card-body">
        <h2>{course.title}</h2>
        <p>
          {course.sections} Sections <i /> {course.lectures} Lectures
        </p>
        <div className="learning-card-progress">
          <ProgressBar value={course.progress} completed={completed} />
          <strong>{course.progress}%</strong>
        </div>
        <div className="learning-card-history">
          {completed ? (
            <>Completed on {course.completedOn}</>
          ) : notStarted ? (
            <>Enrolled on {course.enrolledOn}</>
          ) : (
            <>
              <span>Last watched: {course.lastLesson}</span>
              <time>{course.accessed}</time>
            </>
          )}
        </div>
        <div
          className={`learning-card-actions ${completed ? "has-secondary" : ""}`}
        >
          <button
            type="button"
            className={notStarted ? "is-outline" : "is-primary"}
            onClick={() => onOpen(course)}
          >
            <Play size={17} weight="fill" />{" "}
            {completed
              ? "Review Course"
              : notStarted
                ? "Start Course"
                : "Continue Learning"}
          </button>
          {completed && (
            <button
              type="button"
              className="certificate-action"
              onClick={() =>
                setNotice(
                  "Certificate preview selected. Certificate delivery will be connected later.",
                )
              }
            >
              <Medal size={18} /> Certificate
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function MyCoursesPage({
  onOpenCourse,
  wishlisted,
  onWishlist,
  setNotice,
}: MyCoursesPageProps) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useSessionStorageState(
    "veolms-my-courses-search",
    "",
    isStoredString,
    LEGACY_MY_COURSES_SEARCH_KEYS,
  );
  const [sort, setSort] = useState("recent");
  const [status, setStatus] = useState("all");

  const visibleCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = learningCourses.filter((course) => {
      const selectedStatus = status !== "all" ? status : filter;
      if (selectedStatus !== "all" && course.status !== selectedStatus)
        return false;
      return !query || course.title.toLowerCase().includes(query);
    });
    if (sort === "title")
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "progress")
      result = [...result].sort((a, b) => b.progress - a.progress);
    return result;
  }, [filter, search, sort, status]);

  const summary = [
    { value: 9, label: "Enrolled Courses", icon: BookOpen, tone: "violet" },
    { value: 6, label: "In Progress", icon: Clock, tone: "cyan" },
    { value: 2, label: "Completed", icon: CheckCircle, tone: "green" },
    { value: 2, label: "Certificates Earned", icon: Certificate, tone: "gold" },
  ];

  return (
    <div className="my-courses-page">
      <header className="learning-page-header">
        <div>
          <h1>My Courses</h1>
          <p>All your enrolled courses and learning progress in one place.</p>
        </div>
        <section
          className="learning-summary-row"
          aria-label="Learning overview"
        >
          {summary.map(({ value, label, icon: Icon, tone }) => (
            <article key={label} className={`tone-${tone}`}>
              <span>
                <Icon size={21} weight="duotone" />
              </span>
              <strong>{value}</strong>
              <p>{label}</p>
            </article>
          ))}
        </section>
      </header>

      <div className="learning-filters">
        <div
          className="learning-filter-tabs"
          role="tablist"
          aria-label="Learning status"
        >
          {(
            [
              ["all", "All"],
              ["in-progress", "In Progress"],
              ["not-started", "Not Started"],
              ["completed", "Completed"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === value}
              tabIndex={filter === value ? 0 : -1}
              key={value}
              onClick={() => {
                setFilter(value);
                setStatus("all");
              }}
              onKeyDown={handleRovingTabKeyDown}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="learning-search">
          <MagnifyingGlass size={20} />
          <span className="sr-only">Search my courses</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search my courses..."
          />
        </label>
        <div className="learning-select">
          <ThemedSelect
            value={sort}
            onValueChange={setSort}
            ariaLabel="Sort by learning course order"
            options={[
              ["recent", "Sort by: Recently Accessed"],
              ["title", "Sort by: Title"],
              ["progress", "Sort by: Progress"],
            ]}
          />
        </div>
        <div className="learning-select learning-status-select">
          <ThemedSelect
            value={status}
            onValueChange={setStatus}
            ariaLabel="Filter learning course status"
            options={[
              ["all", "Status"],
              ["in-progress", "In Progress"],
              ["not-started", "Not Started"],
              ["completed", "Completed"],
            ]}
          />
        </div>
      </div>

      {visibleCourses.length ? (
        <section className="learning-course-grid" aria-label="Enrolled courses">
          {visibleCourses.map((course, index) => (
            <LearningCourseCard
              key={course.id}
              course={course}
              wishlisted={wishlisted.has(course.id)}
              onWishlist={onWishlist}
              onOpen={onOpenCourse}
              setNotice={setNotice}
              imagePriority={index === 0}
            />
          ))}
        </section>
      ) : (
        <div className="learning-empty">
          <MagnifyingGlass size={30} />
          <h2>No enrolled courses match</h2>
          <p>Try another search or choose a different learning status.</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilter("all");
              setStatus("all");
            }}
          >
            Reset filters
          </button>
        </div>
      )}

      {filter === "all" && status === "all" && !search.trim() && (
        <div className="learning-load-state" role="status">
          <CircleNotch size={30} />
          <p>Loading more courses...</p>
          <small>{learningCourses.length} of 28 courses loaded</small>
        </div>
      )}
    </div>
  );
}
