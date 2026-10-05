import {
  LESSON_SIDE_PLACEHOLDER_SURFACE_CLASS,
  LessonContentPlaceholderBars,
  LessonSidePlaceholderBars,
} from "../LessonPagePlaceholders";

/**
 * The edge highlight the shell gives its frame, drawn over the card's
 * content. The shell's own is hidden while the sheet shows, because it
 * outlines the full-width frame of the page being left.
 */
const CARD_EDGE_CLASS =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-(--application-frame-edge-shadow) after:content-['']";

/**
 * Stand-in for the lesson page while the mini player expands. It stays in
 * the DOM for as long as the player is mounted, hidden, so an expand can
 * start moving it on the very frame of the click instead of waiting for the
 * lesson page to render. `startLearningPlayerExpand` sizes it, shows it and
 * animates it; the real page replaces it as soon as it is ready.
 *
 * It has the lesson page's shape: the lesson card, and beside it the course
 * content card. The sheet itself is the colour of the app shell, so the
 * strip left between the two cards reads as the gutter. The side block
 * stands in for the course content and the bottom block for everything
 * under the video.
 */
export function LearningExpandPlaceholderSheet() {
  return (
    <div
      aria-hidden="true"
      data-learning-expand-sheet=""
      className="pointer-events-none fixed z-120 hidden overflow-hidden bg-(--app-shell) text-(--text)"
    >
      <div
        data-learning-expand-sheet-lesson=""
        className={`absolute inset-y-0 left-0 overflow-hidden bg-(--canvas) ${CARD_EDGE_CLASS}`}
      >
        <div
          data-learning-expand-sheet-part="content"
          className="absolute hidden content-start gap-4 overflow-hidden px-[clamp(12px,1.5vw,20px)] py-4"
        >
          <LessonContentPlaceholderBars />
        </div>
      </div>
      <div
        data-learning-expand-sheet-part="side"
        className={`absolute hidden flex-col gap-3 overflow-hidden p-4 ${LESSON_SIDE_PLACEHOLDER_SURFACE_CLASS} ${CARD_EDGE_CLASS}`}
      >
        <LessonSidePlaceholderBars />
      </div>
    </div>
  );
}
