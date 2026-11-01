import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Button } from "../../components/Button";
import {
  priceBarPaddingClasses,
  priceBarSurfaceClasses,
} from "./CoursePriceBar";

/**
 * In the course page's band, in place of the price and its button, when
 * the page cannot know what to offer: the course's price could not be
 * loaded, or a signed-in learner's access answer could not (the course may
 * be theirs, and a price would then be wrong). The page itself is fine, so
 * only the band says so, with another try.
 */
export function CourseBandLoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <section
      role="alert"
      className={priceBarSurfaceClasses}
      aria-label="Course pricing and enrollment"
      data-fixed-radius
      data-course-band-load-error
    >
      <div
        className={`${priceBarPaddingClasses} flex flex-col gap-3.5 @2xl/price:flex-row @2xl/price:items-center @2xl/price:justify-between`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <WarningCircle
            size={24}
            weight="fill"
            className="mt-0.5 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="m-0 text-[1.05rem] leading-snug font-bold text-(--text)">
              Something went wrong
            </p>
            <p className="m-0 text-[0.9rem] leading-snug text-(--muted)">
              This couldn&rsquo;t be loaded just now. Please try again.
            </p>
          </div>
        </div>
        {onRetry ? (
          <Button
            motion="static"
            className="h-12! shrink-0 px-6! @2xl/price:min-w-44"
            onClick={onRetry}
          >
            <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
            <span>Try again</span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
