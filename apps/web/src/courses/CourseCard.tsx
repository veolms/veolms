import { Clock } from "@phosphor-icons/react/Clock";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { Eye } from "@phosphor-icons/react/Eye";
import { Heart } from "@phosphor-icons/react/Heart";
import { List } from "@phosphor-icons/react/List";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { Users } from "@phosphor-icons/react/Users";
import { VideoCamera } from "@phosphor-icons/react/VideoCamera";
import type { MouseEvent } from "react";
import type { Course, CourseRole } from "./catalogue";

function formatStudents(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export interface CourseCardProps {
  course: Course;
  role: CourseRole;
  wishlisted: boolean;
  onWishlist: (courseId: string) => void;
  onOpen: (course: Course) => void;
  onExplore: (course: Course) => void;
  onEdit?: (course: Course) => void;
  menuOpen: boolean;
  setMenuOpen: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  imagePriority?: boolean;
}

export function CourseCard({
  course,
  role,
  wishlisted,
  onWishlist,
  onOpen,
  onExplore,
  onEdit,
  menuOpen,
  setMenuOpen,
  setNotice,
  imagePriority = false,
}: CourseCardProps) {
  const openCard = () => {
    if (role === "creator" || course.enrolled) onOpen(course);
    else if (role === "student") onExplore(course);
  };

  return (
    <article
      className="course-card course-card--interactive"
      aria-label={`${course.title}${role === "creator" ? ", preview course" : course.enrolled ? `, ${course.progress}% complete` : ", not enrolled"}`}
    >
      <button
        type="button"
        className="course-card__open"
        aria-label={`${role === "creator" ? "Preview" : course.enrolled ? "Open" : "Explore"} ${course.title}`}
        onClick={openCard}
      />
      <div className="course-card__media">
        <img
          src={course.thumbnail}
          alt=""
          className="course-card__image"
          width={960}
          height={540}
          loading={imagePriority ? "eager" : "lazy"}
          fetchPriority={imagePriority ? "high" : "low"}
          decoding={imagePriority ? "sync" : "async"}
        />
        <span className="course-level">{course.level}</span>
        <button
          type="button"
          className={`course-wishlist ${wishlisted ? "course-wishlist--active" : ""}`}
          aria-label={
            wishlisted
              ? `Remove ${course.title} from wishlist`
              : `Add ${course.title} to wishlist`
          }
          aria-pressed={wishlisted}
          title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onWishlist(course.id);
          }}
        >
          <Heart size={24} weight={wishlisted ? "fill" : "regular"} />
        </button>
      </div>

      <div className="course-card__body">
        <h2>{course.title}</h2>
        <p>{course.description}</p>

        <div className="course-card__facts">
          <span>
            <List size={17} /> {course.sections} Sections
          </span>
          <i aria-hidden="true" />
          <span>
            <VideoCamera size={17} /> {course.lectures} Lectures
          </span>

          {role === "creator" && (
            <div className="course-more-wrap" data-course-menu>
              <button
                type="button"
                className="course-more-button"
                aria-label={`Actions for ${course.title}`}
                aria-expanded={menuOpen}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  setMenuOpen(menuOpen ? null : course.id);
                }}
              >
                <DotsThree size={22} weight="bold" />
              </button>
              {menuOpen && (
                <div
                  className="course-action-menu"
                  role="menu"
                  onClick={(event: MouseEvent<HTMLDivElement>) =>
                    event.stopPropagation()
                  }
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(null);
                      onExplore(course);
                    }}
                  >
                    <Eye size={17} /> View overview
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(null);
                      if (onEdit) {
                        onEdit(course);
                      } else {
                        setNotice(
                          `Edit ${course.title} selected. The editor will be added later.`,
                        );
                      }
                    }}
                  >
                    <Sparkle size={17} /> Edit course
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {role === "student" ? (
          course.enrolled ? (
            <div
              className="course-progress"
              aria-label={`${course.progress}% complete`}
            >
              <span className="course-progress__track">
                <span style={{ width: `${course.progress}%` }} />
              </span>
              <strong>{course.progress}%</strong>
              <span>Complete</span>
            </div>
          ) : (
            <button
              type="button"
              className="course-explore"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onExplore(course);
              }}
            >
              Explore Course
            </button>
          )
        ) : (
          <div
            className="creator-metrics"
            aria-label={`${course.duration}, ${course.students} students enrolled`}
          >
            <span>
              <Clock size={17} /> {course.duration}
            </span>
            <span>
              <Users size={17} /> {formatStudents(course.students)} students
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
