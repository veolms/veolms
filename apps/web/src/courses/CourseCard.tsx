import {
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  CertificateIcon as Certificate,
  ChartBarIcon as ChartBar,
  CopySimpleIcon as CopySimple,
  EyeIcon as Eye,
  FlagIcon as Flag,
  GraduationCapIcon as GraduationCap,
  HeartIcon as Heart,
  LinkSimpleIcon as LinkSimple,
  ListBulletsIcon as ListBullets,
  PaperPlaneTiltIcon as PaperPlaneTilt,
  PencilSimpleIcon as PencilSimple,
  PlayIcon as Play,
  PlusIcon as Plus,
  ShareNetworkIcon as ShareNetwork,
  TrashIcon as Trash,
  UploadSimpleIcon as UploadSimple,
  UsersThreeIcon as UsersThree,
} from "@phosphor-icons/react";
import { getCourseRouteKey } from "./catalogue";
import type { Course, CourseRole } from "./catalogue";
import { CourseActionMenu, MenuAction, MenuDivider } from "./CourseActionMenu";

const courseOverviewPath = (course: Course) =>
  `/courses/${encodeURIComponent(getCourseRouteKey(course))}/overview`;

const creatorStatusStyles = {
  published: "border-emerald-400/25 bg-emerald-500/15 text-emerald-300",
  draft: "border-amber-400/25 bg-amber-500/15 text-amber-300",
  archived: "border-violet-400/25 bg-violet-500/15 text-violet-300",
  bin: "border-rose-400/25 bg-rose-500/15 text-rose-300",
} as const;

const studentStatusStyles = {
  "not-enrolled": "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200",
  "not-started": "border-slate-400/20 bg-slate-500/20 text-slate-200",
  "in-progress": "border-sky-400/25 bg-sky-500/15 text-sky-300",
  completed: "border-emerald-400/25 bg-emerald-500/15 text-emerald-300",
} as const;

const getStudentStatus = (course: Course) => {
  if (!course.enrolled) return "not-enrolled" as const;
  const progress = course.progress ?? 0;
  if (progress >= 100) return "completed" as const;
  if (progress > 0) return "in-progress" as const;
  return "not-started" as const;
};

const getStudentStatusLabel = (course: Course) => {
  const status = getStudentStatus(course);
  if (status === "not-enrolled") return "Not Enrolled";
  if (status === "completed") return "Completed";
  if (status === "in-progress") return "In Progress";
  return "Not Started";
};

export interface CourseCardProps {
  course: Course;
  role: CourseRole;
  wishlisted: boolean;
  onWishlist: (courseId: string) => void;
  onOpen: (course: Course) => void;
  onExplore: (course: Course) => void;
  onEdit?: (course: Course) => void;
  onManage?: (course: Course) => void;
  onPublish?: (course: Course) => void;
  onDeleteRequested?: (course: Course) => void;
  onRestoreRequested?: (course: Course) => Promise<void> | void;
  onNavigatePage: (destination: string) => void;
  menuOpen: boolean;
  setMenuOpen: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  imagePriority?: boolean;
  isBin?: boolean;
}

export function CourseCard({
  course,
  role,
  wishlisted,
  onWishlist,
  onOpen,
  onExplore,
  onEdit,
  onManage,
  onPublish,
  onDeleteRequested,
  onRestoreRequested,
  onNavigatePage,
  menuOpen,
  setMenuOpen,
  setNotice,
  imagePriority = false,
  isBin = false,
}: CourseCardProps) {
  const studentStatus = getStudentStatus(course);
  const progress = course.progress ?? 0;
  const overviewPath = courseOverviewPath(course);
  const absoluteCourseUrl =
    typeof window === "undefined"
      ? overviewPath
      : new URL(overviewPath, window.location.origin).toString();

  const closeThen = (action: () => void) => {
    setMenuOpen(null);
    action();
  };

  const handleRestore = async (courseToRestore: Course) => {
    if (!onRestoreRequested) return;
    try {
      await onRestoreRequested(courseToRestore);
    } catch {
      // Error notifications are handled by onRestoreCourse in the page container
    }
  };

  const copyCourseLink = async () => {
    try {
      await navigator.clipboard.writeText(absoluteCourseUrl);
      setNotice("Course link copied to your clipboard.");
    } catch {
      setNotice("Copying is unavailable on this device.");
    }
  };

  const shareCourse = async () => {
    if (typeof navigator.share !== "function") {
      await copyCourseLink();
      return;
    }
    try {
      await navigator.share({ title: course.title, url: absoluteCourseUrl });
    } catch {
      // Closing the operating-system share sheet is not an application error.
    }
  };

  const openThumbnail = () => {
    onOpen(course);
  };

  const thumbnailActionLabel =
    role === "creator"
      ? `Play ${course.title}`
      : course.enrolled
        ? `${progress > 0 && progress < 100 ? "Resume" : progress >= 100 ? "Review" : "Start"} ${course.title}`
        : `Play free preview for ${course.title}`;
  const thumbnailActionTooltip =
    role === "creator"
      ? "Play Course"
      : course.enrolled
        ? "Continue Learning"
        : "Play Free Preview";

  const lifecycleAction = () => {
    if (course.lifecycleStatus === "published") {
      setNotice(`${course.title} was unpublished.`);
      return;
    }
    if (course.lifecycleStatus === "draft") {
      setNotice(`${course.title} was published.`);
      return;
    }
    setNotice(`${course.title} was restored.`);
  };

  return (
    <article
      className="group relative min-w-0 overflow-visible rounded-xl border border-(--border) bg-(--card-surface,var(--surface)) shadow-(--card-shadow) transition-[background-color,box-shadow] duration-200 hover:bg-(--card-surface-hover,var(--hover)) hover:shadow-(--card-hover-shadow)"
      aria-label={`${course.title}${role === "creator" ? `, ${course.lifecycleStatus}` : course.enrolled ? `, ${progress}% complete` : ", not enrolled"}`}
      data-course-card
    >
      <div
        className="relative aspect-video overflow-hidden rounded-t-[11px] bg-(--track)"
        data-course-card-media
      >
        <img
          src={course.thumbnail}
          alt=""
          className="h-full w-full object-cover"
          width={960}
          height={540}
          loading={imagePriority ? "eager" : "lazy"}
          fetchPriority={imagePriority ? "high" : "low"}
          decoding={imagePriority ? "sync" : "async"}
        />

        <button
          type="button"
          className="group/media absolute inset-0 z-10 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-(--accent)"
          aria-label={thumbnailActionLabel}
          title={thumbnailActionTooltip}
          onClick={openThumbnail}
        >
          <span className="absolute inset-0 bg-slate-950/50 opacity-0 transition-opacity duration-200 group-hover/media:opacity-100 group-focus-visible/media:opacity-100" />
          <span className="relative flex min-h-16 min-w-16 scale-90 items-center justify-center rounded-full border-2 border-white bg-slate-950/55 text-white opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.32)] transition-[opacity,transform] duration-200 group-hover/media:scale-100 group-hover/media:opacity-100 group-focus-visible/media:scale-100 group-focus-visible/media:opacity-100">
            <Play size={30} weight="fill" className="translate-x-0.5" />
          </span>
        </button>

        {role === "creator" ? (
          <div className="absolute left-3.5 top-3.5 z-20 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex min-h-7 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold capitalize ${isBin || course.deletedAt ? creatorStatusStyles.bin : creatorStatusStyles[course.lifecycleStatus]}`}
              data-course-card-tag
            >
              {isBin || course.deletedAt ? "Deleted" : course.lifecycleStatus}
            </span>
          </div>
        ) : (
          <>
            <div className="absolute left-3.5 top-3.5 z-20 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex min-h-7 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold ${studentStatusStyles[studentStatus]}`}
                data-course-card-tag
              >
                {getStudentStatusLabel(course)}
              </span>
            </div>
            {!course.enrolled && (
              <button
                type="button"
                className={`absolute right-3 top-3 z-20 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white shadow-lg transition-colors hover:bg-slate-950/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${wishlisted ? "text-rose-400" : ""}`}
                aria-label={
                  wishlisted
                    ? `Remove ${course.title} from wishlist`
                    : `Add ${course.title} to wishlist`
                }
                aria-pressed={wishlisted}
                onClick={() => onWishlist(course.id)}
              >
                <Heart size={21} weight={wishlisted ? "fill" : "regular"} />
              </button>
            )}
          </>
        )}
      </div>

      <div
        className="relative flex min-h-46 flex-col p-4"
        data-course-card-details
      >
        <a
          href={overviewPath}
          className="absolute inset-0 z-10 cursor-pointer rounded-b-[11px] outline-none transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
          aria-label={`View course overview for ${course.title}`}
          title="View Course Overview"
          data-course-card-curriculum
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            onNavigatePage(overviewPath);
          }}
        />

        <div
          className="-mx-2 flex min-w-0 items-start"
          data-course-card-info-row
        >
          <div className="min-w-0 flex-1 px-2 py-1.5 text-left">
            <h2 className="truncate text-[0.92rem] font-semibold leading-8 tracking-[-0.015em] text-(--text) lg:text-[0.98rem]">
              {course.title}
            </h2>
            <p className="mt-0.5 truncate text-[0.75rem] leading-6 text-(--muted)">
              {course.sections} Sections{" "}
              <span className="mx-px inline-block" aria-hidden="true">
                •
              </span>{" "}
              {course.lectures} Lectures{" "}
              <span className="mx-px inline-block" aria-hidden="true">
                •
              </span>{" "}
              {course.duration}
            </p>
          </div>

          <CourseActionMenu
            open={menuOpen}
            onOpenChange={(open) => setMenuOpen(open ? course.id : null)}
            ariaLabel={`Actions for ${course.title}`}
            dataMenu=""
          >
            {role === "creator" ? (
              isBin || course.deletedAt ? (
                onRestoreRequested ? (
                  <MenuAction
                    Icon={ArrowCounterClockwise}
                    label="Restore Course"
                    onClick={() => closeThen(() => void handleRestore(course))}
                  />
                ) : null
              ) : (
                <>
                  <MenuAction
                    Icon={PencilSimple}
                    label="Edit Course"
                    onClick={() => closeThen(() => onEdit?.(course))}
                  />
                  <MenuAction
                    Icon={ListBullets}
                    label="Manage Curriculum"
                    onClick={() => closeThen(() => onManage?.(course))}
                  />
                  <MenuAction
                    Icon={Eye}
                    label="Course Preview"
                    onClick={() => closeThen(() => onExplore(course))}
                  />
                  <MenuAction
                    Icon={ChartBar}
                    label="Analytics"
                    onClick={() =>
                      closeThen(() =>
                        onNavigatePage(`/analytics?course=${course.id}`),
                      )
                    }
                  />
                  <MenuAction
                    Icon={UsersThree}
                    label="Manage Students"
                    onClick={() =>
                      closeThen(() =>
                        onNavigatePage(`/students?course=${course.id}`),
                      )
                    }
                  />
                  <MenuDivider />
                  <MenuAction
                    Icon={CopySimple}
                    label="Copy Course Link"
                    onClick={() => closeThen(() => void copyCourseLink())}
                  />
                  <MenuAction
                    Icon={PaperPlaneTilt}
                    label="Duplicate Course"
                    onClick={() =>
                      closeThen(() =>
                        setNotice(`${course.title} was duplicated as a draft.`),
                      )
                    }
                  />
                  <MenuDivider />
                  <MenuAction
                    Icon={UploadSimple}
                    label={
                      course.lifecycleStatus === "published"
                        ? "Unpublish Course"
                        : "Publish Course"
                    }
                    onClick={() =>
                      closeThen(() => {
                        if (onPublish) {
                          onPublish(course);
                        } else {
                          onNavigatePage(
                            `/courses/create?edit=${encodeURIComponent(course.id)}&tab=publish`,
                          );
                        }
                      })
                    }
                  />
                  <MenuDivider />
                  <MenuAction
                    Icon={Trash}
                    label="Delete Course"
                    destructive
                    onClick={() => closeThen(() => onDeleteRequested?.(course))}
                  />
                </>
              )
            ) : course.enrolled ? (
              <>
                <MenuAction
                  Icon={Eye}
                  label="Course Preview"
                  onClick={() => closeThen(() => onExplore(course))}
                />
                <MenuDivider />
                <MenuAction
                  Icon={PaperPlaneTilt}
                  label="Open Discussions"
                  onClick={() =>
                    closeThen(() =>
                      onNavigatePage(`/discussions?course=${course.id}`),
                    )
                  }
                />
                <MenuDivider />
                <MenuAction
                  Icon={ShareNetwork}
                  label="Share Course"
                  onClick={() => closeThen(() => void shareCourse())}
                />
                <MenuAction
                  Icon={LinkSimple}
                  label="Copy Course Link"
                  onClick={() => closeThen(() => void copyCourseLink())}
                />
                <MenuDivider />
                {course.certificateAvailable && progress >= 100 && (
                  <MenuAction
                    Icon={Certificate}
                    label="View Certificate"
                    onClick={() =>
                      closeThen(() =>
                        setNotice(
                          `Certificate for "${course.title}" is ready.`,
                        ),
                      )
                    }
                  />
                )}
                <MenuAction
                  Icon={Flag}
                  label="Report an Issue"
                  onClick={() =>
                    closeThen(() =>
                      setNotice(`Issue reporting opened for ${course.title}.`),
                    )
                  }
                />
              </>
            ) : (
              <>
                <MenuAction
                  Icon={Eye}
                  label="Course Preview"
                  onClick={() => closeThen(() => onExplore(course))}
                />
                <MenuDivider />
                <MenuAction
                  Icon={ShareNetwork}
                  label="Share Course"
                  onClick={() => closeThen(() => void shareCourse())}
                />
                <MenuAction
                  Icon={LinkSimple}
                  label="Copy Course Link"
                  onClick={() => closeThen(() => void copyCourseLink())}
                />
                <MenuDivider />
                <MenuAction
                  Icon={Flag}
                  label="Report Course"
                  onClick={() =>
                    closeThen(() =>
                      setNotice(`Course report opened for ${course.title}.`),
                    )
                  }
                />
              </>
            )}
          </CourseActionMenu>
        </div>

        <div
          className="relative z-10 mt-auto flex flex-col"
          data-course-card-actions
        >
          {role === "student" &&
            !course.enrolled &&
            Boolean(course.pricing) && (
              <div
                className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"
                data-course-card-pricing
                aria-label={`Course price ${course.pricing?.price}`}
              >
                <strong className="text-[1.55rem] font-extrabold leading-none tracking-[-0.035em] text-(--text)">
                  {course.pricing?.price}
                </strong>
                {Boolean(course.pricing?.originalPrice) && (
                  <span className="text-[0.95rem] font-medium leading-none text-(--muted) line-through">
                    {course.pricing?.originalPrice}
                  </span>
                )}
                {Boolean(course.pricing?.discount) && (
                  <span className="inline-flex items-center rounded-md bg-emerald-500/20 px-2 py-1 text-[0.72rem] font-bold leading-none text-emerald-300">
                    {course.pricing?.discount}
                  </span>
                )}
              </div>
            )}

          {role === "student" && course.enrolled && (
            <div
              className="mb-4 flex items-center justify-between gap-3 text-xs"
              data-course-card-progress-container
              aria-label={`${progress}% complete`}
            >
              <span
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-(--track)"
                data-course-card-progress
              >
                <span
                  className="block h-full rounded-full bg-(--accent)"
                  style={{ width: `${progress}%` }}
                  data-course-card-progress-fill
                />
              </span>
              <strong className="min-w-8 text-right font-semibold text-(--text-secondary)">
                {progress}%
              </strong>
            </div>
          )}

          {role === "creator" &&
          (isBin || course.deletedAt) &&
          !onRestoreRequested ? null : (
            <button
              type="button"
              disabled={
                role === "creator" &&
                Boolean(isBin || course.deletedAt) &&
                !onRestoreRequested
              }
              className={`relative z-20 min-h-11 w-full items-center rounded-(--control-radius-action) border border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-(--accent) px-3.25 text-[14px]! font-[650]! text-(--on-accent) shadow-[0_10px_22px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
                role === "creator"
                  ? "flex justify-center gap-2 hover:bg-(--accent-hover)"
                  : "flex justify-center gap-3 hover:bg-(--accent-hover)"
              }`}
              data-control-radius-action
              onClick={() => {
                if (role === "creator") {
                  if (isBin || course.deletedAt) {
                    if (onRestoreRequested) {
                      void handleRestore(course);
                    }
                    return;
                  }
                  onEdit?.(course);
                  return;
                }

                if (course.enrolled) {
                  onOpen(course);
                  return;
                }

                onNavigatePage(overviewPath);
              }}
            >
              {role === "creator" ? (
                isBin || course.deletedAt ? (
                  <>
                    <ArrowCounterClockwise
                      className="shrink-0"
                      size={17}
                      weight="bold"
                      aria-hidden="true"
                    />
                    <span>Restore Course</span>
                  </>
                ) : (
                  <>
                    <PencilSimple
                      className="shrink-0"
                      size={17}
                      weight="bold"
                      aria-hidden="true"
                    />
                    <span>Edit Course</span>
                  </>
                )
              ) : (
                <span className="flex min-w-0 items-center gap-3">
                  {course.enrolled ? (
                    <Play
                      className="shrink-0"
                      size={17}
                      weight="fill"
                      aria-hidden="true"
                    />
                  ) : (
                    <ListBullets
                      className="shrink-0"
                      size={17}
                      weight="regular"
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">
                    {course.enrolled ? "Continue Learning" : "View Curriculum"}
                  </span>
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
