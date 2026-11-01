import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
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
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";
import { courseOverviewBody } from "../routing/prerenderedBodies";
import { prefetchCoursePage } from "../services/courses";
import { getCourseRouteKey, hasBegunCourse } from "./catalogue";
import type { CourseOpenOptions } from "./catalogue";
import {
  mergeIntentHandlers,
  useLessonOpenIntent,
  type LessonOpenTarget,
} from "../learning/lessonOpenIntent";
import { formatCourseProgress } from "../learning/courseProgressFormat";
import type { Course, CourseRole } from "./catalogue";
import { ALT_DRAG_TEXT_SELECT_CLASSES } from "./altDragTextSelect";
import { CourseActionMenu, MenuAction, MenuDivider } from "./CourseActionMenu";
import {
  courseCardOffersEnrollment,
  resolveCourseCardLearnerAction,
} from "./courseCardAction";
import { CourseCardThumbnail } from "./CourseCardThumbnail";
import { PinToHomeMenuAction } from "./PinToHomeMenuAction";
import {
  COURSE_CARD_BUTTON_CLASSES,
  CourseCardEarlyActions,
  CourseCardLoadError,
  CourseCardOfferShimmer,
  CourseCardPricing,
  CourseCardProgress,
  LearnerActionContent,
} from "./CourseCardActionParts";
import { useRetryCourseCardState } from "./viewerCourseState";
import { raisedCourseCardClasses } from "../components/cardElevation";
import type { Permission } from "@veolms/contracts";
import { useCapabilities } from "../services/authorization/authorization.queries";
import { canOpenNavigationPath } from "../shell/navigationPermissions";
import { CURRICULUM_PERMISSIONS } from "./course-editor/curriculumPermissions";
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
    text: `${course.sections} ${course.sections === 1 ? "Section" : "Sections"}`,
  }),
  lectures: (course) => ({
    Icon: MonitorPlay,
    text: `${course.lectures} ${course.lectures === 1 ? "Lecture" : "Lectures"}`,
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
  /**
   * Opens the course's lessons. The card names the lesson and asks for it
   * to play when the press was on its play button or "Continue Learning".
   */
  onOpen: (course: Course, options?: CourseOpenOptions) => void;
  onExplore: (course: Course) => void;
  onEdit?: (course: Course) => void;
  onEditIntent?: (course: Course) => void;
  onManage?: (course: Course) => void;
  onPublish?: (course: Course) => void;
  onDeleteRequested?: (course: Course) => void;
  onRestoreRequested?: (course: Course) => Promise<void> | void;
  /** Offers "Unenroll" on a free course the learner is enrolled in. */
  onUnenrollRequested?: (course: Course) => void;
  /** Offers it on every enrolled course, free or not (an admin's own). */
  canUnenrollFromAnyCourse?: boolean;
  onNavigatePage: (destination: string) => void;
  menuOpen: boolean;
  setMenuOpen: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  imagePriority?: boolean;
  studentHome?: boolean;
  isBin?: boolean;
  isDeleting?: boolean;
  isAdmin?: boolean;
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
  canUnenrollFromAnyCourse = false,
  onNavigatePage,
  menuOpen,
  setMenuOpen,
  setNotice,
  imagePriority = false,
  studentHome = false,
  isBin = false,
  isDeleting = false,
  isAdmin = false,
  facts = DEFAULT_COURSE_CARD_FACTS,
  factIcons = false,
}: CourseCardProps) {
  const isPublic = variant === "public";
  // Never for a course nobody can enrol in themselves; see the helper.
  const cardOffer = {
    isPublic,
    publicAction,
    canSelfEnroll: course.canSelfEnroll,
    comesWithAnotherCourse: Boolean(course.includedWith?.length),
  };
  const isPublicEnrollmentAction =
    isPublic && courseCardOffersEnrollment(cardOffer);
  const learnerAction = resolveCourseCardLearnerAction({
    ...cardOffer,
    enrolled: course.enrolled,
  });
  // Each action shows only to whoever may take it on this course: the
  // creator through any of their roles, anyone else through a role that
  // reaches every course (a course manager, a content editor).
  const capabilities = useCapabilities({ enabled: role === "creator" });
  const mayOnCourse = (permission: Permission) =>
    isAdmin || capabilities.canOnCourse(permission, course);
  // The curriculum opens for its sections or for any lesson action.
  const canManageCurriculum = CURRICULUM_PERMISSIONS.some(mayOnCourse);
  const canEdit =
    canManageCurriculum ||
    (
      [
        "course.details.update",
        "course.thumbnail.update",
        "course.pricing.update",
      ] as const
    ).some(mayOnCourse);
  const canChangePublication = mayOnCourse(
    course.lifecycleStatus === "published"
      ? "course.unpublish"
      : "course.publish",
  );
  const canDelete = mayOnCourse("course.delete");
  // Restoring from the bin is academy-wide, even for one's own course.
  const canRestore =
    isAdmin || capabilities.canOnCourse("course.restore", null);
  const staffPermissions = new Set(capabilities.permissions);
  const canOpenAnalytics = canOpenNavigationPath(
    "/analytics",
    staffPermissions,
  );
  const canOpenStudents = canOpenNavigationPath("/students", staffPermissions);
  // Neither a price nor progress until it is known which this viewer gets
  // (see `Course.viewerStatePending`); the actions' place shimmers instead.
  const viewerStatePending =
    role === "student" && !isPublic && Boolean(course.viewerStatePending);
  // What stands in the place of the price and the button once the viewer
  // is known, when the card cannot offer the course: the viewer's own
  // courses or the price could not be loaded ("failed"), or the price is
  // on its way ("pending"). A course the learner holds needs no price, nor
  // does one that comes free with another.
  const offerUnavailable: "failed" | "pending" | null =
    role !== "student" || viewerStatePending
      ? null
      : course.viewerStateFailed && !isPublic
        ? "failed"
        : course.enrolled || course.includedWith?.length
          ? null
          : (course.priceStatus ?? null);
  const retryCardState = useRetryCourseCardState();
  const progress = course.progress ?? 0;
  const begun = hasBegunCourse(course);
  const progressText = formatCourseProgress(progress);
  const overviewPath = courseOverviewPath(course);
  // The course page, fetched while the pointer is on the way to it (a
  // hover, keyboard focus, or the touch itself where nothing hovers): its
  // code, its curriculum file and the viewer's access answer, so the page
  // opens drawn rather than loading.
  const queryClient = useQueryClient();
  const prefetchOverview = () => {
    void courseOverviewBody.preload();
    void prefetchCoursePage(queryClient, getCourseRouteKey(course));
  };
  // What the main button is about to do, started ahead of the press: the
  // editor for a creator, the course page for a learner who does not hold
  // the course (one who does goes to the lessons instead).
  const onMainButtonIntent = () => {
    if (isDeleting) return;
    if (role === "creator") {
      if (canEdit && !isBin && !course.deletedAt) onEditIntent?.(course);
      return;
    }
    if (!course.enrolled && !viewerStatePending) prefetchOverview();
  };
  // The lesson the play button (and, on a course the learner holds, the
  // main button) opens: readied while the pointer rests on it, and opened
  // playing. A learner's course goes on where they left it, on any device;
  // one they do not hold plays its preview, from the first lesson; a
  // creator's opens where the course's address does. A visitor's picture
  // leads to the course page instead, and a course in the bin to nothing.
  const courseRouteKey = getCourseRouteKey(course);
  const playTarget: LessonOpenTarget | null =
    isDeleting || isPublic || viewerStatePending
      ? null
      : role === "creator"
        ? isBin || course.deletedAt
          ? null
          : { courseKey: courseRouteKey, lesson: "course" }
        : course.enrolled
          ? {
              courseKey: courseRouteKey,
              lesson: "resume",
              review: progress >= 100,
            }
          : { courseKey: courseRouteKey, lesson: 1 };
  const playIntent = useLessonOpenIntent(playTarget);
  const openPlaying = () =>
    playIntent.open((lessonNumber) =>
      onOpen(course, { lessonNumber, autoplay: true }),
    );
  const mainButtonIntent = mergeIntentHandlers(
    {
      onPointerEnter: onMainButtonIntent,
      onFocus: onMainButtonIntent,
      onPointerDown: onMainButtonIntent,
    },
    role === "student" && course.enrolled ? playIntent.handlers : undefined,
  );
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
    if (playTarget) {
      openPlaying();
      return;
    }
    onOpen(course);
  };

  // A course the learner holds but has not begun is started, not continued
  // (the home's cards and the course's own page say the same).
  const enrolledActionLabel = begun ? "Continue Learning" : "Start Learning";
  const thumbnailActionLabel = isPublic
    ? isPublicEnrollmentAction
      ? `Enroll in ${course.title}`
      : `View ${course.title}`
    : role === "creator"
      ? `Play ${course.title}`
      : course.enrolled
        ? `${begun && progress < 100 ? "Resume" : progress >= 100 ? "Review" : "Start"} ${course.title}`
        : `Preview ${course.title}`;
  const thumbnailActionTooltip = isPublic
    ? isPublicEnrollmentAction
      ? "Enroll Now"
      : "View Course"
    : role === "creator"
      ? "Play Course"
      : course.enrolled
        ? enrolledActionLabel
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

  // The card is raised like the home page's course row (see
  // `raisedCourseCardClasses`).
  // On a phone the cards span the screen edge to edge, so they have no side
  // border there: it would hold the thumbnail a pixel off each edge.
  return (
    <article
      className={`${ALT_DRAG_TEXT_SELECT_CLASSES} group relative min-w-0 overflow-hidden rounded-2xl border max-[640px]:border-x-0 transition-[background-color,box-shadow,opacity,border-color] duration-200 ${
        isDeleting
          ? "border-(--card-border,var(--border)) bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) opacity-60 pointer-events-none select-none"
          : `border-(--card-border,var(--border)) bg-(--card-surface,var(--surface)) bg-(image:--raised-surface-image) shadow-(--card-shadow) hover:bg-(--card-surface-hover,var(--hover)) hover:shadow-(--card-hover-shadow) ${raisedCourseCardClasses}`
      }`}
      aria-label={`${course.title}${isDeleting ? ", deleting..." : isPublic ? ", public course" : role === "creator" ? `, ${course.lifecycleStatus}` : viewerStatePending || offerUnavailable === "failed" ? "" : course.enrolled ? `, ${progressText} complete` : ", not enrolled"}`}
      aria-busy={isDeleting}
      data-course-card
      data-course-card-id={course.id}
      data-deleting={isDeleting ? "true" : undefined}
    >
      <div
        className="relative aspect-video overflow-hidden rounded-t-2xl"
        data-course-card-media
      >
        {/* A course with no image keeps the card's surface, a shade darker,
            as its image shimmers while loading (without the pulse). */}
        {course.thumbnail ? (
          <CourseCardThumbnail course={course} priority={imagePriority} />
        ) : (
          <div
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
            aria-hidden="true"
          />
        )}

        <button
          type="button"
          // On a device with no hover the button itself lets a touch through
          // and only the round play button inside it takes one: a tap
          // elsewhere on the thumbnail must not start the video (it reaches
          // whatever the card does underneath instead).
          className="group/media absolute inset-0 z-10 flex items-center justify-center [@media(hover:none)]:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-(--accent)"
          aria-label={thumbnailActionLabel}
          title={thumbnailActionTooltip}
          {...(playTarget ? playIntent.handlers : {})}
          onClick={openThumbnail}
          disabled={isDeleting}
        >
          {/* A device with no hover (a phone, a tablet without a mouse) can
              never bring the play button up, so there the shade and the
              button are always showing: the shade lighter, since it never
              lifts, and the button a size larger. */}
          <span className="absolute inset-0 bg-slate-950/50 opacity-0 transition-opacity duration-200 group-hover/media:opacity-100 group-focus-visible/media:opacity-100 [@media(hover:none)]:bg-slate-950/30 [@media(hover:none)]:opacity-100" />
          {/* The blur is only on while the button shows, and fades with it. A
              backdrop filter gets a compositor layer even at zero opacity,
              and that layer pushes the rest of the card into another one
              above it; on every card of a page those layers made a sidebar
              drag drop parts of the cards on tablets. For the same reason the
              always-on button of a device with no hover has no blur at all. */}
          <span className="relative flex min-h-16 min-w-16 scale-90 items-center justify-center rounded-full bg-black/70 text-white opacity-0 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:min-h-18 [@media(hover:none)]:min-w-18 [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:[&>svg]:size-9 shadow-[0_10px_28px_rgba(0,0,0,0.5)] transition-[opacity,transform,backdrop-filter] duration-200 group-hover/media:scale-100 group-hover/media:opacity-100 group-hover/media:backdrop-blur-[2px] group-focus-visible/media:scale-100 group-focus-visible/media:opacity-100 group-focus-visible/media:backdrop-blur-[2px]">
            <Play size={30} weight="fill" />
          </span>
        </button>

        {playIntent.pageLinks}

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
          onPointerEnter={prefetchOverview}
          onFocus={prefetchOverview}
          onPointerDown={prefetchOverview}
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
            <p className="@container mt-0.5 flex min-w-0 items-center gap-x-2 overflow-hidden text-[0.8125rem] leading-6 whitespace-nowrap text-(--muted)">
              {facts.map((fact, index) => {
                const { Icon, text } = courseCardFacts[fact](course);
                const isLast = index === facts.length - 1;
                // Only the last fact gives way when the line is short. On a
                // line too short for the others whole (a narrow card), the
                // last one is left out with its dot, and the one before it
                // gives way instead, so no fact is cut off mid-word.
                const dropsWhenNarrow = isLast && facts.length > 1;
                const givesWayWhenNarrow = index === facts.length - 2;
                return (
                  <Fragment key={fact}>
                    {index > 0 ? (
                      <span
                        aria-hidden="true"
                        className={
                          dropsWhenNarrow ? "@max-[13rem]:hidden" : undefined
                        }
                      >
                        •
                      </span>
                    ) : null}
                    <CourseCardFact
                      Icon={factIcons ? Icon : undefined}
                      className={
                        isLast
                          ? `min-w-0 truncate${dropsWhenNarrow ? " @max-[13rem]:hidden" : ""}`
                          : givesWayWhenNarrow
                            ? "shrink-0 @max-[13rem]:min-w-0 @max-[13rem]:shrink @max-[13rem]:truncate"
                            : undefined
                      }
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
                  onRestoreRequested && canRestore ? (
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
                    {canManageCurriculum && (
                      <MenuAction
                        Icon={ListBullets}
                        label="Manage Curriculum"
                        onIntent={() => onEditIntent?.(course)}
                        onClick={() => closeThen(() => onManage?.(course))}
                      />
                    )}
                    <MenuAction
                      Icon={Eye}
                      label="Course Overview"
                      onClick={() => closeThen(() => onExplore(course))}
                    />
                    {canOpenAnalytics && (
                      <MenuAction
                        Icon={ChartBar}
                        label="Analytics"
                        onClick={() =>
                          closeThen(() =>
                            onNavigatePage(`/analytics?course=${course.id}`),
                          )
                        }
                      />
                    )}
                    {canOpenStudents && (
                      <MenuAction
                        Icon={UsersThree}
                        label="Manage Students"
                        onClick={() =>
                          closeThen(() =>
                            onNavigatePage(`/students?course=${course.id}`),
                          )
                        }
                      />
                    )}
                    <MenuDivider />
                    <MenuAction
                      Icon={CopySimple}
                      label="Copy Course Link"
                      onClick={() => closeThen(() => void copyCourseLink())}
                    />
                    {canChangePublication && <MenuDivider />}
                    {canChangePublication && (
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
                    )}
                    {canDelete && <MenuDivider />}
                    {canDelete && (
                      <MenuAction
                        Icon={Trash}
                        label="Delete Course"
                        destructive
                        onClick={() =>
                          closeThen(() => onDeleteRequested?.(course))
                        }
                      />
                    )}
                  </>
                ) : (
                  <>
                    <MenuAction
                      Icon={ListBullets}
                      label="View Curriculum"
                      onClick={() => closeThen(() => onExplore(course))}
                    />
                    {canOpenAnalytics && (
                      <MenuAction
                        Icon={ChartBar}
                        label="Analytics"
                        onClick={() =>
                          closeThen(() =>
                            onNavigatePage(`/analytics?course=${course.id}`),
                          )
                        }
                      />
                    )}
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
                  <MenuAction
                    Icon={PaperPlaneTilt}
                    label="Open Discussions"
                    onClick={() =>
                      closeThen(() =>
                        onNavigatePage(`/discussions?course=${course.id}`),
                      )
                    }
                  />
                  <PinToHomeMenuAction
                    courseId={course.id}
                    courseTitle={course.title}
                    onDone={closeThen}
                    setNotice={setNotice}
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
                  {onUnenrollRequested &&
                  (course.pricing?.free || canUnenrollFromAnyCourse) ? (
                    <MenuAction
                      Icon={SignOut}
                      label="Unenroll"
                      destructive
                      onClick={() =>
                        closeThen(() => onUnenrollRequested(course))
                      }
                    />
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
          {viewerStatePending ? (
            <CourseCardEarlyActions
              course={course}
              studentHome={studentHome}
              offerAction={resolveCourseCardLearnerAction({
                ...cardOffer,
                enrolled: false,
              })}
            />
          ) : null}

          {offerUnavailable === "failed" ? (
            <CourseCardLoadError onRetry={retryCardState} />
          ) : offerUnavailable === "pending" ? (
            <CourseCardOfferShimmer />
          ) : null}

          {!viewerStatePending &&
          !offerUnavailable &&
          role === "student" &&
          !course.enrolled &&
          (course.pricing || course.includedWith?.[0]) ? (
            <CourseCardPricing
              pricing={course.pricing}
              studentHome={studentHome}
              freeWith={course.includedWith?.[0]?.title}
              freeWithHref={
                course.includedWith?.[0]
                  ? courseOverviewPath({
                      ...course,
                      id: course.includedWith[0].id,
                      slug: course.includedWith[0].slug,
                    })
                  : undefined
              }
              onNavigate={onNavigatePage}
            />
          ) : null}

          {!viewerStatePending &&
          !offerUnavailable &&
          role === "student" &&
          course.enrolled ? (
            <CourseCardProgress
              progress={progress}
              progressText={progressText}
              begun={begun}
            />
          ) : null}

          {viewerStatePending ||
          offerUnavailable ||
          (role === "creator" &&
            (isBin || course.deletedAt) &&
            (!onRestoreRequested || !canRestore)) ? null : (
            <button
              type="button"
              disabled={
                isDeleting ||
                (role === "creator" &&
                  Boolean(isBin || course.deletedAt) &&
                  (!onRestoreRequested || !canRestore))
              }
              className={`${COURSE_CARD_BUTTON_CLASSES} ${
                role === "creator"
                  ? "flex justify-center gap-2 hover:bg-(--accent-hover)"
                  : "flex justify-center gap-3 hover:bg-(--accent-hover)"
              }`}
              data-control-radius-action
              {...mainButtonIntent}
              onClick={() => {
                if (isDeleting) return;
                if (role === "creator") {
                  if (isBin || course.deletedAt) {
                    if (onRestoreRequested && canRestore) {
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
                  openPlaying();
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
                <LearnerActionContent
                  action={learnerAction}
                  continueLabel={enrolledActionLabel}
                />
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
