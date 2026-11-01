import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Play } from "@phosphor-icons/react/Play";
import { Button } from "../../components/Button";
import {
  priceBarActionClasses,
  priceBarPaddingClasses,
  priceBarSurfaceClasses,
} from "./CoursePriceBar";

/**
 * `CourseLearnerProgressBar` as the page shows it before its scripts have
 * run, for a learner this tab knows holds the course: the same box, drawn
 * from what the document's head found in the tab's copies
 * (`courseCardEarlyState`). The figure, the bar, the lessons done and the
 * button's words come from the style it writes; the parts it says nothing
 * about stay hidden. Nothing in it can be pressed: the real band takes its
 * place once the page knows. Keep the two looking the same.
 */
export function CourseLearnerProgressBarEarly() {
  return (
    <section
      className={`${priceBarSurfaceClasses} pointer-events-none`}
      aria-hidden="true"
      data-fixed-radius
    >
      <div
        className={`${priceBarPaddingClasses} flex flex-col gap-5 @2xl/price:flex-row @2xl/price:items-center @2xl/price:justify-between @2xl/price:gap-10 @2xl/price:py-6!`}
      >
        <div className="flex min-w-0 flex-col gap-3 @2xl/price:w-fit @2xl/price:max-w-[60%] @2xl/price:min-w-64 @2xl/price:shrink-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex items-baseline gap-2 leading-none font-bold tracking-[-0.02em] whitespace-nowrap text-(--text)">
              <CheckCircle
                size={24}
                weight="fill"
                className="hidden self-center text-emerald-500"
                aria-hidden="true"
                data-course-early-complete=""
              />
              <span className="text-[1.7rem] tabular-nums after:content-(--course-card-early-progress-text)" />
              <span className="text-[1.3rem]">complete</span>
            </span>
            {/* Shown as `contents`, so the dot and the count wrap as the
                real band's own two items do. */}
            <span className="hidden" data-course-early-lessons="">
              <span
                aria-hidden="true"
                className="self-center text-[0.8rem] text-(--muted) opacity-70"
              >
                •
              </span>
              <span className="text-[1.05rem] whitespace-nowrap text-(--muted) tabular-nums after:content-(--course-early-lessons)" />
            </span>
          </div>
          <span className="block h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_9%,transparent)]">
            <span
              // The real band's gradient (Tailwind blends in oklab), or the
              // finished course's green from the head's style.
              className="block h-full rounded-full bg-[image:var(--course-early-fill,linear-gradient(to_right_in_oklab,var(--accent),color-mix(in_srgb,var(--accent)_78%,white)))]"
              style={{ width: "var(--course-card-early-progress, 0%)" }}
              data-course-early-overview-fill=""
            />
          </span>
        </div>

        <Button
          motion="static"
          className={`${priceBarActionClasses} w-full @2xl/price:w-auto @2xl/price:min-w-60`}
          tabIndex={-1}
        >
          <Play
            size="1.15em"
            weight="fill"
            className="shrink-0"
            aria-hidden="true"
          />
          <span className="truncate">
            <span data-course-card-early-label="start">Start Learning</span>
            <span data-course-card-early-label="continue" className="hidden">
              Continue Learning
            </span>
            <span data-course-card-early-label="review" className="hidden">
              Review Course
            </span>
          </span>
        </Button>
      </div>
    </section>
  );
}
