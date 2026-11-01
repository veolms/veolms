import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import type { HomePageCourseOption } from "@veolms/contracts";
import { useState } from "react";
import { Button } from "../components/Button";
import { useHomePageLessonVideoOptions } from "../services/home";
import { fieldClass, insetRowClass } from "./homePageSettingsControls";
import { formatVideoLength } from "./heroVideoFormat";
import { fuzzyMatches } from "../lib/fuzzySearch";

// One column the list's own width (`grid-cols-1`), so a long title truncates
// in its row instead of widening every row past the list.
const listClass =
  "grid max-h-96 grid-cols-1 gap-2 overflow-y-auto overscroll-contain p-px";
const rowButtonClass = `flex w-full min-w-0 cursor-pointer items-center gap-3 p-2 pl-2.5 text-left transition-colors hover:border-(--accent) focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-55 disabled:hover:border-[color-mix(in_srgb,var(--text)_10%,transparent)] ${insetRowClass}`;
const badgeClass =
  "rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-1.5 py-0.5 text-[11px] font-semibold text-(--muted)";

function CourseThumbnail({ course }: { course?: HomePageCourseOption }) {
  return (
    <span className="aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-(--track)">
      {course?.thumbnailUrl ? (
        <img
          src={course.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : null}
    </span>
  );
}

function CourseList({
  courses,
  optionsLoading,
  onOpen,
}: {
  courses: readonly HomePageCourseOption[];
  optionsLoading: boolean;
  onOpen: (courseId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const shown = query
    ? courses.filter((course) => fuzzyMatches(query, course.title))
    : courses;

  return (
    <div className="grid min-w-0 gap-2.5">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search courses..."
        aria-label="Search courses"
        className={`${fieldClass} h-11`}
      />
      {optionsLoading ? (
        <p className="text-sm text-(--muted)">Loading courses...</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-(--muted)">
          {courses.length === 0
            ? "There are no published courses to choose from."
            : "No course matches your search."}
        </p>
      ) : (
        <ul className={listClass} aria-label="Courses">
          {shown.map((course) => (
            <li key={course.id}>
              <button
                type="button"
                className={rowButtonClass}
                onClick={() => onOpen(course.id)}
              >
                <CourseThumbnail course={course} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-(--text)">
                  {course.title}
                </span>
                {course.isFree ? (
                  <span className={badgeClass}>Free</span>
                ) : null}
                <CaretRight
                  size={16}
                  weight="bold"
                  className="shrink-0 text-(--muted)"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Chooses a lesson video for the hero: the published courses first, then
 * the lessons with a video of the one opened.
 */
export function HeroLessonVideoPicker({
  courses,
  optionsLoading,
  selected,
  onSelect,
}: {
  courses: readonly HomePageCourseOption[];
  optionsLoading: boolean;
  /** The lesson chosen now, if it is a lesson. */
  selected: { courseId: string; lessonId: string } | null;
  onSelect: (courseId: string, lessonId: string) => void;
}) {
  // It opens on the chosen lesson's course, where the choice can be seen.
  const [openCourseId, setOpenCourseId] = useState<string | null>(
    selected?.courseId ?? null,
  );
  const lessonsQuery = useHomePageLessonVideoOptions(openCourseId);
  const openCourse = courses.find((course) => course.id === openCourseId);

  if (!openCourseId) {
    return (
      <CourseList
        courses={courses}
        optionsLoading={optionsLoading}
        onOpen={setOpenCourseId}
      />
    );
  }

  const lessons = lessonsQuery.data?.lessons ?? [];
  return (
    <div className="grid min-w-0 gap-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setOpenCourseId(null)}
          className="flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-semibold text-(--muted) hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <CaretLeft size={15} weight="bold" />
          All courses
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-(--text)">
          {openCourse?.title ?? "Course"}
        </span>
      </div>

      {lessonsQuery.isLoading ? (
        <p className="text-sm text-(--muted)">Loading lessons...</p>
      ) : lessonsQuery.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-rose-500">
            The lessons could not be loaded.
          </p>
          <Button onClick={() => void lessonsQuery.refetch()}>Try again</Button>
        </div>
      ) : lessons.length === 0 ? (
        <p className="text-sm text-(--muted)">
          This course has no published lesson with a video.
        </p>
      ) : (
        <ul
          className={listClass}
          aria-label={`Lessons of ${openCourse?.title ?? "the course"}`}
        >
          {lessons.map((lesson) => {
            const isSelected =
              selected?.courseId === openCourseId &&
              selected.lessonId === lesson.id;
            const length = formatVideoLength(lesson.durationSeconds);
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!lesson.isReady}
                  className={`${rowButtonClass} ${
                    isSelected
                      ? "border-(--accent)! ring-2 ring-(--accent)/20"
                      : ""
                  }`}
                  onClick={() => onSelect(openCourseId, lesson.id)}
                >
                  <span className="w-7 shrink-0 text-center text-xs font-semibold text-(--muted) tabular-nums">
                    {lesson.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-(--text)">
                      {lesson.title}
                    </span>
                    <span className="block truncate text-xs text-(--muted)">
                      {[lesson.sectionTitle, length]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {lesson.isReady ? null : (
                    <span className={badgeClass}>Processing</span>
                  )}
                  {lesson.isPreview ? (
                    <span className={badgeClass}>Preview</span>
                  ) : null}
                  {isSelected ? (
                    <CheckCircle
                      size={20}
                      weight="fill"
                      className="shrink-0 text-(--accent)"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
