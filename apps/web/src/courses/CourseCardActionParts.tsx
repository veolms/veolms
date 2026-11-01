import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type { Course } from "./catalogue";
import type { CourseCardLearnerAction } from "./courseCardAction";
import { courseCardShimmerClass } from "./courseCardShimmer";
import { priceRegionClass } from "./CoursePriceSwitch";
import { FreeWithCourseNote } from "./FreeWithCourseNote";

/** The card's main button, as every card draws it. */
export const COURSE_CARD_BUTTON_CLASSES =
  "relative z-20 min-h-11 w-full items-center !rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-(--accent) px-3.25 text-[15px]! font-semibold! text-(--on-accent) shadow-[0_10px_22px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

/** The price line of a course the viewer does not hold. */
export function CourseCardPricing({
  pricing,
  studentHome,
  freeWith,
  freeWithHref,
  onNavigate,
}: {
  pricing: NonNullable<Course["pricing"]>;
  studentHome: boolean;
  /**
   * The course a linked-only course comes free with: shown in place of a
   * price, as "Free with" that course.
   */
  freeWith?: string;
  /** That course's page: its name becomes a link to it. */
  freeWithHref?: string;
  onNavigate?: (path: string) => void;
}) {
  if (freeWith) {
    return (
      <div
        className="mt-3 mb-4 flex min-w-0 items-baseline gap-x-2"
        data-course-card-pricing
        aria-label={`Free with ${freeWith}`}
      >
        <strong className="shrink-0 text-[1.55rem] font-extrabold leading-none tracking-[-0.035em] text-(--text)">
          Free
        </strong>
        <span className="min-w-0 truncate text-[0.9rem] font-medium leading-none text-(--text-secondary)">
          <FreeWithCourseNote
            title={freeWith}
            href={freeWithHref}
            onNavigate={onNavigate}
          />
        </span>
      </div>
    );
  }
  if (!pricing.international) {
    return (
      <CourseCardPriceLine
        line={pricing}
        showDiscountBadge={pricing.showDiscountBadge}
        studentHome={studentHome}
        display="flex"
      />
    );
  }
  // Both prices are in the page; the visitor's region picks one, and a
  // shimmer of the line's height stands in until it is known.
  return (
    <>
      <div
        aria-hidden="true"
        className={`mt-3 mb-4 h-[1.55rem] w-1/2 rounded-md ${courseCardShimmerClass} ${priceRegionClass("pending", "block")}`}
      />
      <CourseCardPriceLine
        line={pricing}
        showDiscountBadge={pricing.showDiscountBadge}
        studentHome={studentHome}
        display={priceRegionClass("domestic")}
      />
      <CourseCardPriceLine
        line={pricing.international}
        showDiscountBadge={pricing.showDiscountBadge}
        studentHome={studentHome}
        display={priceRegionClass("international")}
      />
    </>
  );
}

function CourseCardPriceLine({
  line,
  showDiscountBadge,
  studentHome,
  display,
}: {
  line: Pick<
    NonNullable<Course["pricing"]>,
    "price" | "originalPrice" | "discount"
  >;
  showDiscountBadge?: boolean;
  studentHome: boolean;
  /** "flex", or the classes that show it for one region only. */
  display: string;
}) {
  return (
    <div
      className={`${display} ${studentHome ? "mt-3 mb-4 flex-wrap items-center gap-x-2 gap-y-1" : "mt-3 mb-4 flex-wrap items-baseline gap-x-3 gap-y-1"}`}
      data-course-card-pricing
      aria-label={`Course price ${line.price}`}
    >
      {Boolean(line.originalPrice) && (
        <span
          className={`${studentHome ? "shrink-0 whitespace-nowrap " : ""}text-[0.95rem] font-medium leading-none text-(--muted) line-through`}
        >
          {line.originalPrice}
        </span>
      )}
      <strong
        className={`${studentHome ? "shrink-0 " : ""}text-[1.55rem] font-extrabold leading-none tracking-[-0.035em] text-(--text)`}
      >
        {line.price}
      </strong>
      {/* Paid courses opt in from their pricing settings; a free course
          with an original price always shows "Free". */}
      {showDiscountBadge && Boolean(line.discount) && (
        <span className="inline-flex items-center self-center rounded-lg bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-2.5 py-1.5 text-[0.8rem] leading-none font-bold text-[color-mix(in_srgb,var(--success)_72%,var(--text))]">
          {line.discount}
        </span>
      )}
    </div>
  );
}

/** The progress line of a course the viewer holds. */
export function CourseCardProgress({
  progress,
  progressText,
  begun,
}: {
  /** A percent, or a CSS width (the early copy's custom property). */
  progress: number | string;
  /** The figure, or nothing when a style draws it (the early copy). */
  progressText?: string;
  begun: boolean;
}) {
  return (
    <div
      className="mb-4 flex items-center justify-between gap-3 text-xs"
      data-course-card-progress-container
      aria-label={progressText ? `${progressText} complete` : undefined}
    >
      <span
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-(--track)"
        data-course-card-progress
      >
        <span
          // Begun shows a sliver even while it is still 0.00%.
          className={`block h-full rounded-full bg-(--accent) ${begun ? "min-w-1.5" : ""}`}
          style={{
            width: typeof progress === "number" ? `${progress}%` : progress,
          }}
          data-course-card-progress-fill
        />
      </span>
      <strong
        className={`min-w-8 text-right font-semibold text-(--text-secondary) ${progressText ? "" : "after:content-(--course-card-early-progress-text)"}`}
      >
        {progressText}
      </strong>
    </div>
  );
}

/** What the main button says to someone who does not manage the course. */
export function LearnerActionContent({
  action,
  continueLabel,
}: {
  action: CourseCardLearnerAction;
  /** "Continue Learning", or "Start Learning" before any progress. */
  continueLabel: string;
}) {
  return (
    <span
      className={`flex min-w-0 items-center ${action === "continue" ? "gap-3" : "gap-2.5"}`}
    >
      {action === "continue" ? (
        <>
          <Play
            className="shrink-0"
            size={17}
            weight="fill"
            aria-hidden="true"
          />
          <span className="truncate">{continueLabel}</span>
        </>
      ) : action === "view" ? (
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
  );
}

/**
 * The price (or progress) line and the button, as shimmers: the size of a
 * price line, which is the taller of the two, so the button stays put when
 * a price arrives.
 */
function CourseCardActionsShimmer({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      data-course-card-actions-pending
      className={className}
    >
      <div
        className={`mt-3 mb-4 h-[1.55rem] w-3/4 rounded-md ${courseCardShimmerClass}`}
      />
      <div
        className={`min-h-11 w-full rounded-[10px] ${courseCardShimmerClass}`}
      />
    </div>
  );
}

/**
 * A card's price or progress while it is not known yet which this viewer
 * gets (`Course.viewerStatePending`): what the page shows before its
 * scripts have run. All three are in the page and a style picks one before
 * the first paint, from what the document's head knows:
 *
 * - nobody signed in (`data-session-hint` absent): the price and its button;
 * - signed in, with this tab's copy of the enrolled courses
 *   (`data-course-cards-early`, see `courseCardEarlyState.ts`, whose style
 *   turns a held course's card to its progress): progress for a course in
 *   the copy, the price for any other;
 * - signed in with no copy (a new tab): the shimmer, until the courses come.
 *
 * None of it can be pressed: it stands in until the card knows, and then
 * the card draws its own. The selectors are written out in full because
 * Tailwind only generates classes it finds as text.
 */
export function CourseCardEarlyActions({
  course,
  studentHome,
  offerAction,
}: {
  course: Course;
  studentHome: boolean;
  /** The button for someone who does not hold the course. */
  offerAction: CourseCardLearnerAction;
}) {
  return (
    <>
      <CourseCardActionsShimmer className="[:root:not([data-session-hint])_&]:hidden [:root[data-course-cards-early]_&]:hidden" />
      <div
        aria-hidden="true"
        data-course-card-early="offer"
        className="pointer-events-none hidden [:root:not([data-session-hint])_&]:block [:root[data-course-cards-early]_&]:block"
      >
        {course.pricing ? (
          <CourseCardPricing
            pricing={course.pricing}
            studentHome={studentHome}
            freeWith={course.includedWith?.[0]?.title}
          />
        ) : null}
        <span
          className={`${COURSE_CARD_BUTTON_CLASSES} flex justify-center gap-3`}
          data-control-radius-action
        >
          <LearnerActionContent action={offerAction} continueLabel="" />
        </span>
      </div>
      <div
        aria-hidden="true"
        data-course-card-early="held"
        className="pointer-events-none hidden"
      >
        <CourseCardProgress
          progress="var(--course-card-early-progress, 0%)"
          begun={false}
        />
        <span
          className={`${COURSE_CARD_BUTTON_CLASSES} flex justify-center gap-3`}
          data-control-radius-action
        >
          <span data-course-card-early-label="start" className="contents">
            <LearnerActionContent
              action="continue"
              continueLabel="Start Learning"
            />
          </span>
          <span data-course-card-early-label="continue" className="hidden">
            <LearnerActionContent
              action="continue"
              continueLabel="Continue Learning"
            />
          </span>
          {/* A finished course: the card says "Continue Learning" too. */}
          <span data-course-card-early-label="review" className="hidden">
            <LearnerActionContent
              action="continue"
              continueLabel="Continue Learning"
            />
          </span>
        </span>
      </div>
    </>
  );
}
