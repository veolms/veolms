import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { getCourseThumbnailCdnUrl } from "../courses/courseMedia";
import type { LearningCourse } from "../StudentPages";
import { StudentHomeThumbnail } from "./StudentHomeThumbnail";

type HomeEnrolledCourse = LearningCourse & {
  thumbnailUrl?: string | null;
  thumbnailMediaId?: string | null;
};

interface HomeEnrolledCourseCardProps {
  course: HomeEnrolledCourse;
  imagePriority?: boolean;
  onOpenCourse: (course: LearningCourse) => void;
}

export function HomeEnrolledCourseCard({
  course,
  imagePriority = false,
  onOpenCourse,
}: HomeEnrolledCourseCardProps) {
  const notStarted = course.progress <= 0;

  return (
    <article className="home-mini-course">
      <div className="home-mini-course__media">
        <StudentHomeThumbnail
          src={course.thumbnailUrl}
          fallbackSrcs={[
            getCourseThumbnailCdnUrl(course.thumbnailMediaId),
            course.thumbnail,
          ]}
          alt=""
          loading={imagePriority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={imagePriority ? "high" : "low"}
        />
        <span
          className={`learning-status home-mini-course__status ${notStarted ? "not-started" : "in-progress"}`}
        >
          {notStarted ? "Not Started" : "In Progress"}
        </span>
      </div>
      <div className="home-mini-course__body">
        <h3>{course.title}</h3>
        <p>
          {course.sections} Sections · {course.lectures} Lectures
        </p>
      </div>
      {notStarted ? null : (
        <div className="home-mini-progress">
          <span
            className="learning-progress-track"
            role="progressbar"
            aria-label={`${course.title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={course.progress}
          >
            <span style={{ width: `${course.progress}%` }} />
          </span>
          <span aria-hidden="true">{course.progress}%</span>
        </div>
      )}
      <button
        type="button"
        className="primary-learning-action home-mini-action"
        onClick={() => onOpenCourse(course)}
      >
        <Play size={16} weight="fill" />
        <span>{notStarted ? "Start Learning" : "Continue Learning"}</span>
      </button>
    </article>
  );
}
