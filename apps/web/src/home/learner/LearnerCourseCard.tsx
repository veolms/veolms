import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type { EnrolledCourse } from "@veolms/contracts";
import { CourseActionMenu, MenuAction } from "../../courses/CourseActionMenu";
import type { NavigateTo } from "../../routing/navigation";
import { GuestHomeLink } from "../guest/GuestHomeLink";
import { LearnerCourseThumbnail } from "./LearnerCourseThumbnail";
import { getEnrolledCourseKey } from "./learnerHomePlan";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * One of the learner's courses. The whole card goes back into the course;
 * its menu holds the other places the course leads to.
 *
 * In a single column (a phone) it is a row with a small thumbnail, so a few
 * courses fit on a screen; from two columns up it is the same card the
 * catalogue shows, thumbnail on top.
 */
export function LearnerCourseCard({
  course,
  href,
  priority,
  menuOpen,
  setMenuOpen,
  onOpen,
  onNavigatePage,
}: {
  course: EnrolledCourse;
  /** The course's address in the player, for the card to be a real link. */
  href: string;
  /** Its thumbnail is among the first pictures on the page. */
  priority: boolean;
  menuOpen: boolean;
  setMenuOpen: (courseId: string | null) => void;
  onOpen: () => void;
  onNavigatePage: NavigateTo;
}) {
  const progress = course.progress ?? 0;
  const completed = progress >= 100;
  const action = completed ? "Review" : progress > 0 ? "Continue" : "Start";
  const closeThen = (run: () => void) => {
    setMenuOpen(null);
    run();
  };

  return (
    <article
      aria-label={`${course.courseTitle}, ${progress}% complete`}
      className="group/card relative flex min-w-0 items-center gap-3.5 overflow-hidden rounded-2xl border border-(--card-border,var(--border)) bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) p-3 shadow-(--card-shadow) transition-[background-color,box-shadow] duration-200 hover:bg-(--card-surface-hover,var(--hover)) hover:shadow-(--card-hover-shadow) @lg/courses:block @lg/courses:p-0"
    >
      <div className="relative aspect-video w-30 shrink-0 overflow-hidden rounded-lg bg-[#05070c] @lg/courses:w-auto @lg/courses:rounded-none">
        <LearnerCourseThumbnail course={course} priority={priority} />
        <span
          aria-hidden="true"
          className="absolute inset-0 hidden place-items-center bg-slate-950/50 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 group-has-[a:focus-visible]/card:opacity-100 motion-reduce:transition-none @lg/courses:grid"
        >
          <span className="grid size-14 place-items-center rounded-full bg-black/70 text-white shadow-[0_10px_28px_rgb(0_0_0/0.5)]">
            <Play size={26} weight="fill" />
          </span>
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col @lg/courses:px-4 @lg/courses:pt-2.5 @lg/courses:pb-4">
        <div className="flex min-w-0 items-start gap-1">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[0.9375rem] leading-6 font-semibold tracking-[-0.015em] text-(--text) @lg/courses:text-base @lg/courses:leading-10 @2xl/courses:text-lg">
              {course.courseTitle}
            </h3>
            <p className="truncate text-[0.8125rem] leading-5 text-(--muted) @lg/courses:leading-6">
              {plural(course.totalSections, "Section", "Sections")}
              <span aria-hidden="true" className="mx-2">
                •
              </span>
              {plural(course.totalLessons, "Lecture", "Lectures")}
            </p>
          </div>
          <CourseActionMenu
            open={menuOpen}
            onOpenChange={(open) => setMenuOpen(open ? course.courseId : null)}
            ariaLabel={`Actions for ${course.courseTitle}`}
            className="relative z-30 -mt-2 -mr-2 shrink-0 @lg/courses:mt-0"
            dataMenu=""
          >
            <MenuAction
              Icon={Eye}
              label="Course Overview"
              onClick={() =>
                closeThen(() =>
                  onNavigatePage(
                    `/courses/${encodeURIComponent(getEnrolledCourseKey(course))}/overview`,
                  ),
                )
              }
            />
            <MenuAction
              Icon={PaperPlaneTilt}
              label="Open Discussions"
              onClick={() =>
                closeThen(() =>
                  onNavigatePage(`/discussions?course=${course.courseId}`),
                )
              }
            />
          </CourseActionMenu>
        </div>

        <div className="mt-2 flex items-center gap-3 @lg/courses:mt-3.5">
          <span
            aria-hidden="true"
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-(--track)"
            data-sidebar-swipe-ignore=""
          >
            <span
              className={`block h-full rounded-full ${completed ? "bg-(--success)" : "bg-(--accent)"}`}
              style={{ width: `${progress}%` }}
            />
          </span>
          <span
            className={`flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap ${
              progress > 0 ? "text-(--text-secondary)" : "text-(--muted)"
            }`}
          >
            {completed ? (
              <>
                <CheckCircle
                  size={14}
                  weight="fill"
                  aria-hidden="true"
                  className="text-(--success)"
                />
                Completed
              </>
            ) : progress > 0 ? (
              `${progress}% complete`
            ) : (
              "Not started"
            )}
          </span>
        </div>
      </div>

      <GuestHomeLink
        href={href}
        onNavigatePage={onOpen}
        aria-label={`${action} ${course.courseTitle}`}
        title={`${action} Learning`}
        className="absolute inset-0 z-10 rounded-2xl outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
      />
    </article>
  );
}
