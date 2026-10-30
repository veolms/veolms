const PLACEHOLDER_BAR_CLASS =
  "block shrink-0 animate-pulse rounded-md bg-[color-mix(in_srgb,var(--text)_12%,transparent)] motion-reduce:animate-none";

const SIDE_ROW_WIDTHS = [
  "w-4/5",
  "w-3/5",
  "w-11/12",
  "w-2/3",
  "w-5/6",
  "w-1/2",
];

/** Surface of the course content column the side placeholder stands in for. */
export const LESSON_SIDE_PLACEHOLDER_SURFACE_CLASS =
  "bg-[color-mix(in_srgb,var(--surface)_91%,var(--canvas))]";

/**
 * Loading bars for the course content column: the course card, the section
 * row, then a run of chapter cards. Lay them out in a `flex-col gap-3` box.
 */
export function LessonSidePlaceholderBars() {
  return (
    <>
      <span className={`${PLACEHOLDER_BAR_CLASS} h-28 w-full rounded-xl`} />
      <span className={`${PLACEHOLDER_BAR_CLASS} h-10 w-full rounded-lg`} />
      {SIDE_ROW_WIDTHS.map((width, index) => (
        <span
          key={index}
          className="flex shrink-0 flex-col gap-2.5 rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3.5 py-3"
        >
          <span className={`${PLACEHOLDER_BAR_CLASS} h-3.5 ${width}`} />
          <span className={`${PLACEHOLDER_BAR_CLASS} h-3 w-10`} />
        </span>
      ))}
    </>
  );
}

/**
 * Loading bars for everything under the video: the lesson title, the
 * description, the composer and the first comments. Lay them out in a
 * `grid content-start gap-4` box.
 */
export function LessonContentPlaceholderBars() {
  return (
    <>
      <span className={`${PLACEHOLDER_BAR_CLASS} h-6 w-3/5`} />
      <span className={`${PLACEHOLDER_BAR_CLASS} h-24 w-full rounded-xl`} />
      <span className={`${PLACEHOLDER_BAR_CLASS} h-12 w-full rounded-xl`} />
      <span className={`${PLACEHOLDER_BAR_CLASS} h-5 w-2/5`} />
      <span className={`${PLACEHOLDER_BAR_CLASS} h-16 w-full rounded-xl`} />
      <span className={`${PLACEHOLDER_BAR_CLASS} h-16 w-full rounded-xl`} />
    </>
  );
}
