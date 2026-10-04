import {
  LESSON_SIDE_PLACEHOLDER_SURFACE_CLASS,
  LessonContentPlaceholderBars,
  LessonSidePlaceholderBars,
} from "../LessonPagePlaceholders";

/**
 * Stand-in for the lesson page while the mini player expands. It stays in
 * the DOM for as long as the player is mounted, hidden, so an expand can
 * start moving it on the very frame of the click instead of waiting for the
 * lesson page to render. `startLearningPlayerExpand` sizes it, shows it and
 * animates it; the real page replaces it as soon as it is ready.
 *
 * The side block stands in for the course content column and the bottom
 * block for everything under the video.
 */
export function LearningExpandPlaceholderSheet() {
  return (
    <div
      aria-hidden="true"
      data-learning-expand-sheet=""
      className="pointer-events-none fixed z-120 hidden overflow-hidden bg-(--canvas) text-(--text)"
    >
      <div
        data-learning-expand-sheet-part="side"
        className={`absolute hidden flex-col gap-3 overflow-hidden p-4 ${LESSON_SIDE_PLACEHOLDER_SURFACE_CLASS}`}
      >
        <LessonSidePlaceholderBars />
      </div>
      <div
        data-learning-expand-sheet-part="content"
        className="absolute hidden content-start gap-4 overflow-hidden px-[clamp(12px,1.5vw,20px)] py-4"
      >
        <LessonContentPlaceholderBars />
      </div>
    </div>
  );
}
