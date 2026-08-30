import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { MedalIcon as Medal } from "@phosphor-icons/react/Medal";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { ThemedSelect } from "./ThemedSelect";
import { handleRovingTabKeyDown } from "./accessibility/rovingTabFocus";
import javascriptThumbnail from "./assets/course-thumbnails/javascript-960.webp";
import typescriptThumbnail from "./assets/course-thumbnails/typescript-960.webp";
import nodeThumbnail from "./assets/course-thumbnails/nodejs-960.webp";
import mongodbThumbnail from "./assets/course-thumbnails/mongodb-960.webp";
import awsThumbnail from "./assets/course-thumbnails/aws-960.webp";
import veolmsThumbnail from "./assets/learning-thumbnails/veolms-course.webp";
import illustratorThumbnail from "./assets/learning-thumbnails/illustrator-course.webp";
import reactThumbnail from "./assets/learning-thumbnails/react-course.webp";
import d3Thumbnail from "./assets/learning-thumbnails/d3-course.webp";
import {
  isStoredString,
  useSessionStorageState,
} from "./learning/useSessionStorageState";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "./searchShortcut";

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
    lectures: 600,
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

  return (
    <div className="my-courses-page">
      <header className="learning-page-header">
        <div>
          <h1>My Courses</h1>
          <p>All your enrolled courses and learning progress in one place.</p>
        </div>
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
            id="legacy-learning-search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search my courses..."
            data-search-shortcut-target
            aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
          />
          <SearchShortcutHint />
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
