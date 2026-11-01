import { ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Button } from "../../components/Button";
import type { NavigateTo } from "../../routing/navigation";
import type { Course } from "../catalogue";
import { getCourseEditorPath } from "../courseEditorRouting";
import {
  CoursePriceDisplay,
  type CoursePriceDisplayPrice,
  priceBarActionClasses,
  priceBarPaddingClasses,
  priceBarSurfaceClasses,
} from "./CoursePriceBar";
import { CourseStatusTag } from "./CourseStatusTag";
import { HoverFillIcon } from "./HoverFillIcon";

interface CourseManagerBarProps {
  course: Course;
  price: CoursePriceDisplayPrice;
  onNavigatePage?: NavigateTo;
}

/**
 * The two buttons share a height: 3rem on a phone, where they share a row,
 * and beside the price the 3.5rem of the learner's button, so the bar is as
 * tall as the one a learner sees.
 */
const managerActionHeight = "h-12! @2xl/price:h-14!";

/**
 * The bar's main button with the shared height taken out: both heights are
 * `!important`, and the shared `h-14!` would win over `managerActionHeight`.
 */
const editButtonClasses = priceBarActionClasses.replace("h-14! ", "");

const publishButtonClasses = `inline-flex ${managerActionHeight} min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[0.6875rem] border border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-transparent px-5 text-[1rem] font-bold whitespace-nowrap text-(--text) transition-colors duration-140 hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)`;

/**
 * What someone who manages the course gets where a learner gets their
 * progress and a visitor the price: the price as a learner sees it, and the ways
 * into the editor (its Publish step while the course is a draft, and its
 * first step). The course's status is a tag after the price, and the
 * way into the course itself is the hero's "Open course" pill; the About
 * and Curriculum boxes under it carry their own "Edit" links to the
 * matching editor tab.
 *
 * Wide, it is one row: the price, and the buttons at the far end. On a
 * phone the buttons take the row under the price.
 */
export function CourseManagerBar({
  course,
  price,
  onNavigatePage,
}: CourseManagerBarProps) {
  const canPublish = course.lifecycleStatus === "draft";
  const openEditor = (step: "basics" | "publish") => () =>
    onNavigatePage?.(
      getCourseEditorPath({ mode: "edit", courseId: course.id, step }),
    );

  return (
    <section
      className={priceBarSurfaceClasses}
      aria-label="Manage this course"
      data-fixed-radius
    >
      <div
        className={`${priceBarPaddingClasses} flex flex-col gap-5 @2xl/price:flex-row @2xl/price:items-center @2xl/price:gap-8`}
      >
        {/* The price exactly as a learner sees it, before any coupon, and
            after its saving whether learners can see the course, a tag of
            the same shape, on the same baseline. */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-2 @2xl/price:flex-1">
          <CoursePriceDisplay price={price} />
          <CourseStatusTag status={course.lifecycleStatus} />
        </div>

        {/* Publish beside Edit while the course is a draft: sharing the row
            on a phone, as wide as their words beside the price. */}
        <div
          className={`grid gap-3 @2xl/price:flex @2xl/price:shrink-0 @2xl/price:items-center ${
            canPublish ? "grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : ""
          }`}
        >
          {canPublish ? (
            <button
              type="button"
              className={publishButtonClasses}
              onClick={openEditor("publish")}
            >
              <ArrowUp size={18} weight="bold" aria-hidden="true" />
              <span>Publish</span>
            </button>
          ) : null}
          <Button
            motion="static"
            className={`${editButtonClasses} ${managerActionHeight} w-full px-6! @2xl/price:w-auto`}
            onClick={openEditor("basics")}
            aria-label="Edit course"
          >
            <HoverFillIcon icon={PencilSimple} />
            {/* "Edit" on a phone, where it shares the row with Publish. */}
            <span>
              Edit<span className="hidden @2xl/price:inline"> course</span>
            </span>
          </Button>
        </div>
      </div>
    </section>
  );
}
