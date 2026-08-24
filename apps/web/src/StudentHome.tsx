import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Clock } from "@phosphor-icons/react/Clock";
import { Fire } from "@phosphor-icons/react/Fire";
import { GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { Play } from "@phosphor-icons/react/Play";
import { Target } from "@phosphor-icons/react/Target";
import type { CSSProperties } from "react";
import javascriptThumbnail from "./assets/course-thumbnails/javascript-960.webp";
import nodeThumbnail from "./assets/course-thumbnails/nodejs-960.webp";
import typescriptThumbnail from "./assets/course-thumbnails/typescript-960.webp";
import typescriptInstructorHero512 from "./assets/learning-thumbnails/typescript-instructor-hero-512.webp";
import typescriptInstructorHero640 from "./assets/learning-thumbnails/typescript-instructor-hero-640.webp";
import typescriptInstructorHero800 from "./assets/learning-thumbnails/typescript-instructor-hero-800.webp";
import typescriptInstructorHero from "./assets/learning-thumbnails/typescript-instructor-hero.webp";
import type { LearningCourse } from "./StudentPages";

interface StudentHomeProps {
  onOpenCourse: (course: LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  studentName?: string;
}

interface SectionHeaderProps {
  icon: typeof BookOpen;
  title: string;
  action?: string;
  onAction?: () => void;
}

const currentCourse: LearningCourse = {
  id: "typescript-course",
  title: "The Ultimate TypeScript Course",
  sections: 24,
  lectures: 160,
  status: "in-progress",
  progress: 52,
  lastLesson: "Conditional Types",
  accessed: "2h ago",
  thumbnail: typescriptThumbnail,
};

const javascriptCourse: LearningCourse = {
  id: "javascript-course",
  title: "The Complete JavaScript Course",
  sections: 20,
  lectures: 142,
  status: "in-progress",
  progress: 38,
  lastLesson: "Closures and the Event Loop",
  accessed: "4h ago",
  thumbnail: javascriptThumbnail,
};

const backendCourse: LearningCourse = {
  id: "backend-nodejs",
  title: "Complete Backend with Node.js",
  sections: 23,
  lectures: 185,
  status: "in-progress",
  progress: 76,
  lastLesson: "Error Handling in Express",
  accessed: "1d ago",
  thumbnail: nodeThumbnail,
};

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

function ProgressBar({ value }: { value: number }) {
  return (
    <span className="learning-progress-track" aria-hidden="true">
      <span style={{ width: `${value}%` }} />
    </span>
  );
}

export function StudentHome({
  onOpenCourse,
  onNavigatePage,
  studentName,
}: StudentHomeProps) {
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
              src={typescriptInstructorHero800}
              srcSet={`${typescriptInstructorHero512} 512w, ${typescriptInstructorHero640} 640w, ${typescriptInstructorHero800} 800w, ${typescriptInstructorHero} 1600w`}
              sizes="(max-width: 820px) calc(100vw - 50px), (max-width: 1180px) 40vw, 430px"
              alt="TypeScript instructor pointing toward the TS course mark"
              width={1600}
              height={900}
              decoding="sync"
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
            {[javascriptCourse, backendCourse].map((course) => (
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
            {[currentCourse, backendCourse].map((course, index) => (
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
