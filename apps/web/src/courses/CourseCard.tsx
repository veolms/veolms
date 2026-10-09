import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CertificateIcon as Certificate } from "@phosphor-icons/react/Certificate";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { MonitorPlayIcon as MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import { CopySimpleIcon as CopySimple } from "@phosphor-icons/react/CopySimple";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { Fragment, type ReactNode } from "react";
import { getCourseRouteKey } from "./catalogue";
import type { Course, CourseRole } from "./catalogue";
import { CourseActionMenu, MenuAction, MenuDivider } from "./CourseActionMenu";
import { CourseCardThumbnail } from "./CourseCardThumbnail";
import { CourseThumbnailPlaceholder } from "./CourseThumbnailPlaceholder";
export {
  courseThumbnailSizes,
  getCourseThumbnailSrcSet,
} from "./courseThumbnail";

const courseOverviewPath = (course: Course) =>
  `/courses/${encodeURIComponent(getCourseRouteKey(course))}/overview`;

/** A figure the card can show under the title. */
export type CourseCardFactName = "sections" | "lectures" | "duration";

const DEFAULT_COURSE_CARD_FACTS: readonly CourseCardFactName[] = [
  "sections",
  "lectures",
  "duration",
];

const courseCardFacts: Record<
  CourseCardFactName,
  (course: Course) => { Icon: typeof BookOpen; text: string }
> = {
  sections: (course) => ({
    Icon: BookOpen,
    text: `${course.sections} Sections`,
  }),
  lectures: (course) => ({
    Icon: MonitorPlay,
    text: `${course.lectures} Lectures`,
  }),
  duration: (course) => ({ Icon: Clock, text: course.duration }),
};

export interface CourseCardProps {
  course: Course;
  role: CourseRole;
  variant?: "catalogue" | "public";
  publicAction?: "view" | "enroll";
  wishlisted: boolean;
  onWishlist: (course: Course) => void;
  onOpen: (course: Course) => void;
  onExplore: (course: Course) => void;
  onEdit?: (course: Course) => void;
  onEditIntent?: (course: Course) => void;
  onManage?: (course: Course) => void;
  onPublish?: (course: Course) => void;
  onDeleteRequested?: (course: Course) => void;
  onRestoreRequested?: (course: Course) => Promise<void> | void;
  /** Offers "Unenroll" on a free course the learner is enrolled in. */
  onUnenrollRequested?: (course: Course) => void;
  onNavigatePage: (destination: string) => void;
  menuOpen: boolean;
  setMenuOpen: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  imagePriority?: boolean;
  studentHome?: boolean;
  isBin?: boolean;
  isDeleting?: boolean;
  isAdmin?: boolean;
  currentUserId?: string;
  /** Which figures the line under the title shows, in order. */
  facts?: readonly CourseCardFactName[];
  /** Whether each of those figures is led by its icon. */
  factIcons?: boolean;
}

export function CourseCard({
  course,
  role,
  variant = "catalogue",
  publicAction = "view",
  wishlisted,
  onWishlist,
  onOpen,
  onExplore,
  onEdit,
  onEditIntent,
  onManage,
  onPublish,
  onDeleteRequested,
  onRestoreRequested,
  onUnenrollRequested,
  onNavigatePage,
  menuOpen,
  setMenuOpen,
  setNotice,
  imagePriority = false,
  studentHome = false,
  isBin = false,
  isDeleting = false,
  isAdmin = false,
  currentUserId,
  facts = DEFAULT_COURSE_CARD_FACTS,
  factIcons = false,
}: CourseCardProps) {
  const isPublic = variant === "public";
  const isPublicEnrollmentAction = isPublic && publicAction === "enroll";
  const canEdit =
    isAdmin ||
    (Boolean(currentUserId) &&
      Boolean(course.creatorId) &&
      course.creatorId === currentUserId);
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
    if (isDeleting) return;
    if (isPublic) {
      onNavigatePage(overviewPath);
      return;
    }
    onOpen(course);
  };

  const thumbnailActionLabel = isPublic
    ? isPublicEnrollmentAction
      ? `Enroll in ${course.title}`
      : `View ${course.title}`
    : role === "creator"
      ? `Play ${course.title}`
      : course.enrolled
        ? `${progress > 0 && progress < 100 ? "Resume" : progress >= 100 ? "Review" : "Start"} ${course.title}`
        : `Preview ${course.title}`;
  const thumbnailActionTooltip = isPublic
    ? isPublicEnrollmentAction
      ? "Enroll Now"
      : "View Course"
    : role === "creator"
      ? "Play Course"
      : course.enrolled
        ? "Continue Learning"
        : "Preview Course";

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
      className={`group relative min-w-0 overflow-hidden rounded-2xl border transition-[background-color,box-shadow,opacity,border-color] duration-200 ${
        isDeleting
          ? "border-(--card-border,var(--border)) bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) opacity-60 pointer-events-none select-none"
          : "border-(--card-border,var(--border)) bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) shadow-(--card-shadow) hover:bg-(--card-surface-hover,var(--hover)) hover:shadow-(--card-hover-shadow)"
      }`}
      aria-label={`${course.title}${isDeleting ? ", deleting..." : isPublic ? ", public course" : role === "creator" ? `, ${course.lifecycleStatus}` : course.enrolled ? `, ${progress}% complete` : ", not enrolled"}`}
      aria-busy={isDeleting}
      data-course-card
      data-deleting={isDeleting ? "true" : undefined}
    >
      <div
        className="relative aspect-video overflow-hidden rounded-t-2xl bg-[#05070c]"
        data-course-card-media
      >
        {course.thumbnail ? (
          <CourseCardThumbnail course={course} priority={imagePriority} />
        ) : (
          <CourseThumbnailPlaceholder />
        )}

        <button
          type="button"
          className="group/media absolute inset-0 z-10 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-(--accent)"
          aria-label={thumbnailActionLabel}
          title={thumbnailActionTooltip}
          onClick={openThumbnail}
          disabled={isDeleting}
        >
          <span className="absolute inset-0 bg-slate-950/50 opacity-0 transition-opacity duration-200 group-hover/media:opacity-100 group-focus-visible/media:opacity-100" />
          {/* The blur is only on while the button shows, and fades with it. A
              backdrop filter gets a compositor layer even at zero opacity,
              and that layer pushes the rest of the card into another one
              above it; on every card of a page those layers made a sidebar
              drag drop parts of the cards on tablets. */}
          <span className="relative flex min-h-16 min-w-16 scale-90 items-center justify-center rounded-full bg-black/70 text-white opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.5)] transition-[opacity,transform,backdrop-filter] duration-200 group-hover/media:scale-100 group-hover/media:opacity-100 group-hover/media:backdrop-blur-[2px] group-focus-visible/media:scale-100 group-focus-visible/media:opacity-100 group-focus-visible/media:backdrop-blur-[2px]">
            <Play size={30} weight="fill" />
          </span>
        </button>

        {isDeleting ? (
          <div className="absolute left-3.5 top-3.5 z-20 flex flex-wrap items-center gap-1.5">
            <span
              className="course-tag inline-flex items-center gap-1.5 border border-red-500/25 bg-red-500/15 text-red-400 font-medium"
              data-course-card-tag
              data-testid="course-deleting-tag"
            >
              <CircleNotch size={11} className="animate-spin text-red-400" />
              <span>Deleting...</span>
            </span>
          </div>
        ) : null}
      </div>

      <div
        className="relative flex min-h-46 flex-col px-4 pt-3 pb-4"
        data-course-card-details
      >
        <a
          href={overviewPath}
          className="absolute inset-0 z-10 cursor-pointer rounded-b-2xl outline-none transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
          aria-label={`View course overview for ${course.title}`}
          title="View Course Overview"
          data-course-card-curriculum
          onClick={(event) => {
            if (isDeleting) {
              event.preventDefault();
              return;
            }
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
          <div className="min-w-0 flex-1 px-2 text-left">
            <h2 className="truncate text-base font-semibold leading-10 tracking-[-0.015em] text-(--text) lg:text-lg">
              {course.title}
            </h2>
            <p className="mt-0.5 flex min-w-0 items-center gap-x-2 overflow-hidden text-[0.8125rem] leading-6 whitespace-nowrap text-(--muted)">
              {facts.map((fact, index) => {
                const { Icon, text } = courseCardFacts[fact](course);
                const isLast = index === facts.length - 1;
                return (
                  <Fragment key={fact}>
                    {index > 0 ? <span aria-hidden="true">•</span> : null}
                    {/* Only the last fact gives way when the line is short. */}
                    <CourseCardFact
                      Icon={factIcons ? Icon : undefined}
                      className={isLast ? "min-w-0 truncate" : undefined}
                    >
                      {text}
                    </CourseCardFact>
                  </Fragment>
                );
              })}
            </p>
          </div>

          {!isDeleting && !isPublic && (
            <CourseActionMenu
              open={menuOpen}
              onOpenChange={(open) => setMenuOpen(open ? course.id : null)}
              ariaLabel={`Actions for ${course.title}`}
              dataMenu=""
            >
              {role === "creator" ? (
                isBin || course.deletedAt ? (
                  onRestoreRequested && canEdit ? (
                    <MenuAction
                      Icon={ArrowCounterClockwise}
                      label="Restore Course"
                      onClick={() =>
                        closeThen(() => void handleRestore(course))
                      }
                    />
                  ) : null
                ) : canEdit ? (
                  <>
                    <MenuAction
                      Icon={PencilSimple}
                      label="Edit Course"
                      onIntent={() => onEditIntent?.(course)}
                      onClick={() => closeThen(() => onEdit?.(course))}
                    />
                    <MenuAction
                      Icon={ListBullets}
                      label="Manage Curriculum"
                      onIntent={() => onEditIntent?.(course)}
                      onClick={() => closeThen(() => onManage?.(course))}
                    />
                    <MenuAction
                      Icon={Eye}
                      label="Course Overview"
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
                    <MenuDivider />
                    <MenuAction
                      Icon={UploadSimple}
                      label={
                        course.lifecycleStatus === "published"
                          ? "Unpublish Course"
                          : "Publish Course"
                      }
                      onIntent={() => onEditIntent?.(course)}
                      onClick={() =>
                        closeThen(() => {
                          if (onPublish) {
                            onPublish(course);
                          } else {
                            onNavigatePage(
                              `/courses/${encodeURIComponent(course.id)}/edit/publish`,
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
                      onClick={() =>
                        closeThen(() => onDeleteRequested?.(course))
                      }
                    />
                  </>
                ) : (
                  <>
                    <MenuAction
                      Icon={ListBullets}
                      label="View Curriculum"
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
                    <MenuDivider />
                    <MenuAction
                      Icon={CopySimple}
                      label="Copy Course Link"
                      onClick={() => closeThen(() => void copyCourseLink())}
                    />
                  </>
                )
              ) : course.enrolled ? (
                <>
                  <MenuAction
                    Icon={Eye}
                    label="Course Overview"
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
                        setNotice(
                          `Issue reporting opened for ${course.title}.`,
                        ),
                      )
                    }
                  />
                  {onUnenrollRequested && course.pricing?.free ? (
                    <>
                      <MenuDivider />
                      <MenuAction
                        Icon={SignOut}
                        label="Unenroll"
                        destructive
                        onClick={() =>
                          closeThen(() => onUnenrollRequested(course))
                        }
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <MenuAction
                    Icon={Eye}
                    label="Course Overview"
                    onClick={() => closeThen(() => onExplore(course))}
                  />
                  <MenuAction
                    icon={
                      <Heart
                        size={17}
                        weight={wishlisted ? "fill" : "regular"}
                        aria-hidden="true"
                      />
                    }
                    label={
                      wishlisted ? "Remove from Wishlist" : "Add to Wishlist"
                    }
                    onClick={() => closeThen(() => onWishlist(course))}
                  />
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
                </>
              )}
            </CourseActionMenu>
          )}
        </div>

        <div
          className="relative z-10 mt-auto flex flex-col"
          data-course-card-actions
        >
          {role === "student" &&
            !course.enrolled &&
            Boolean(course.pricing) && (
              <div
                className={`${studentHome ? "mt-3 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1" : "mt-3 mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"}`}
                data-course-card-pricing
                aria-label={`Course price ${course.pricing?.price}`}
              >
                {Boolean(course.pricing?.originalPrice) && (
                  <span
                    className={`${studentHome ? "shrink-0 whitespace-nowrap " : ""}text-[0.95rem] font-medium leading-none text-(--muted) line-through`}
                  >
                    {course.pricing?.originalPrice}
                  </span>
                )}
                <strong
                  className={`${studentHome ? "shrink-0 " : ""}text-[1.55rem] font-extrabold leading-none tracking-[-0.035em] text-(--text)`}
                >
                  {course.pricing?.price}
                </strong>
                {/* Paid courses opt in from their pricing settings; a free
                    course with an original price always shows "Free". */}
                {course.pricing?.showDiscountBadge &&
                  Boolean(course.pricing.discount) && (
                    <span className="inline-flex items-center self-center rounded-lg bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-2.5 py-1.5 text-[0.8rem] leading-none font-bold text-[color-mix(in_srgb,var(--success)_72%,var(--text))]">
                      {course.pricing.discount}
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
          (!onRestoreRequested || !canEdit) ? null : (
            <button
              type="button"
              disabled={
                isDeleting ||
                (role === "creator" &&
                  Boolean(isBin || course.deletedAt) &&
                  (!onRestoreRequested || !canEdit))
              }
              className={`relative z-20 min-h-11 w-full items-center !rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-(--accent) px-3.25 text-[15px]! font-semibold! text-(--on-accent) shadow-[0_10px_22px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
                role === "creator"
                  ? "flex justify-center gap-2 hover:bg-(--accent-hover)"
                  : "flex justify-center gap-3 hover:bg-(--accent-hover)"
              }`}
              data-control-radius-action
              onPointerEnter={() => {
                if (
                  role === "creator" &&
                  canEdit &&
                  !isBin &&
                  !course.deletedAt
                ) {
                  onEditIntent?.(course);
                }
              }}
              onFocus={() => {
                if (
                  role === "creator" &&
                  canEdit &&
                  !isBin &&
                  !course.deletedAt
                ) {
                  onEditIntent?.(course);
                }
              }}
              onPointerDown={() => {
                if (
                  role === "creator" &&
                  canEdit &&
                  !isBin &&
                  !course.deletedAt
                ) {
                  onEditIntent?.(course);
                }
              }}
              onClick={() => {
                if (isDeleting) return;
                if (role === "creator") {
                  if (isBin || course.deletedAt) {
                    if (onRestoreRequested && canEdit) {
                      void handleRestore(course);
                    }
                    return;
                  }
                  if (!canEdit) {
                    onExplore(course);
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
                ) : !canEdit ? (
                  <>
                    <ListBullets
                      className="shrink-0"
                      size={17}
                      weight="regular"
                      aria-hidden="true"
                    />
                    <span>View Curriculum</span>
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
                <span
                  className={`flex min-w-0 items-center ${course.enrolled ? "gap-3" : "gap-2.5"}`}
                >
                  {course.enrolled ? (
                    <>
                      <Play
                        className="shrink-0"
                        size={17}
                        weight="fill"
                        aria-hidden="true"
                      />
                      <span className="truncate">Continue Learning</span>
                    </>
                  ) : isPublic && !isPublicEnrollmentAction ? (
                    <>
                      <ListBullets
                        className="shrink-0"
                        size={17}
                        weight="regular"
                        aria-hidden="true"
                      />
                      <span className="truncate">View Course</span>
                    </>
                  ) : (
                    <>
                      <span className="truncate">Enroll Now</span>
                      <ArrowRight
                        className="shrink-0 translate-y-[0.5px]"
                        size={18}
                        weight="bold"
                        aria-hidden="true"
                      />
                    </>
                  )}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {isDeleting && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[color-mix(in_srgb,var(--card-surface,var(--surface))_60%,transparent)] backdrop-blur-[2px] transition-opacity duration-200 pointer-events-auto"
          role="status"
          aria-live="polite"
          data-testid="course-deleting-overlay"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-(--surface) px-3.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
            <CircleNotch
              size={14}
              className="animate-spin text-red-500 shrink-0"
            />
            <span className="text-[0.78rem] font-semibold text-(--text)">
              {isBin || course.deletedAt ? "Deleting..." : "Moving to Bin..."}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

/** One fact in the card's summary line: an icon and its figure. */
function CourseCardFact({
  Icon,
  className = "shrink-0",
  children,
}: {
  Icon?: typeof BookOpen;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {Icon ? <Icon className="shrink-0" size={16} aria-hidden="true" /> : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function PublicCourseCard({
  course,
  onNavigatePage,
  publicAction = "view",
  imagePriority = false,
  studentHome = false,
}: {
  course: Course;
  onNavigatePage: (destination: string) => void;
  publicAction?: "view" | "enroll";
  imagePriority?: boolean;
  studentHome?: boolean;
}) {
  return (
    <CourseCard
      course={course}
      role="student"
      variant="public"
      publicAction={publicAction}
      wishlisted={false}
      onWishlist={() => undefined}
      onOpen={() => undefined}
      onExplore={() => undefined}
      onNavigatePage={onNavigatePage}
      menuOpen={false}
      setMenuOpen={() => undefined}
      setNotice={() => undefined}
      imagePriority={imagePriority}
      studentHome={studentHome}
    />
  );
}
