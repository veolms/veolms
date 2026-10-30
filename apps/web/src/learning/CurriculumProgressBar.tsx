/**
 * Thin green completion bar pinned to the bottom edge of its surface. Shared
 * by the section header and the lesson cards so both always render the same
 * thickness, colors, and motion.
 *
 * The height targets 3px but is overridden per display scale so it is an
 * exact whole number of physical pixels (3px at 125% is 3.75 physical
 * pixels, which the browser paints as 3 or 4 rows depending on where the
 * surface sits — that made pixel-identical bars look unequal). Each
 * override is floor(3px) in that scale's physical pixels, keeping the
 * thinner rendition everywhere.
 */
export function CurriculumProgressBar({
  percent,
  hidden = false,
}: {
  percent: number;
  /**
   * Kept in the markup but not shown. The bar is in every section heading
   * whether it is shown or not, so that a page drawn before its scripts
   * run can show it from the browser's copy of the progress by an
   * attribute alone (see lessonPageEarlyState.ts).
   */
  hidden?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      hidden={hidden || undefined}
      data-curriculum-progress-bar=""
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] [@media(resolution:1.25dppx)]:h-[2.4px] [@media(resolution:1.5dppx)]:h-[2.6667px] [@media(resolution:1.75dppx)]:h-[2.8572px] bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
    >
      <span
        className="block h-full rounded-r-full bg-(--success) transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </span>
  );
}
