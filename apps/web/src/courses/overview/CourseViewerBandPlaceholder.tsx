import {
  priceBarPaddingClasses,
  priceBarSurfaceClasses,
} from "./CoursePriceBar";

const block = "rounded-md bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";

/**
 * Holds the place of the band under the course page's hero until it is
 * known which band the viewer gets: the price and the button that buys the
 * course, a learner's progress, or a manager's actions (see
 * `courseViewerState`). It is the band's own box, with a figure and a line
 * where the price or the progress will be and the button's shape where the
 * button will be, so the page under it does not move when the band arrives.
 *
 * It pulses as the app's other placeholders do. Inside a placeholder that
 * already pulses as a whole (the page's own, while the course loads), pass
 * `pulse={false}`: two pulses on top of each other fade twice as deep.
 */
export function CourseViewerBandPlaceholder({
  pulse = true,
}: {
  pulse?: boolean;
}) {
  return (
    <div
      className={`${priceBarSurfaceClasses} ${
        pulse ? "animate-pulse motion-reduce:animate-none" : ""
      }`}
      data-fixed-radius
      aria-hidden="true"
    >
      <div
        className={`${priceBarPaddingClasses} flex flex-col gap-4 @2xl/price:flex-row @2xl/price:items-center @2xl/price:justify-between`}
      >
        <div className="flex w-full flex-col gap-3 @2xl/price:w-80">
          <div className="flex items-center gap-3">
            <div className={`${block} h-7 w-40`} />
            <div className={`${block} h-4 w-32`} />
          </div>
          <div className="h-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]" />
        </div>
        <div className="h-14 w-full rounded-lg bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] @2xl/price:w-60" />
      </div>
    </div>
  );
}
