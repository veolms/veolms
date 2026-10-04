import {
  LESSON_SIDE_PLACEHOLDER_SURFACE_CLASS,
  LessonContentPlaceholderBars,
  LessonSidePlaceholderBars,
} from "./LessonPagePlaceholders";

/**
 * Shown while the lesson workspace code loads. The workspace owns its own
 * stylesheet, which arrives with that code, so this reproduces the page's
 * shape with utilities only: the player slot at its real size, the lesson
 * content under it, and the course content column beside it. The pulsing
 * bars are the only loading indicator; the player slot stays plain black.
 *
 * The column follows the same rules as the real page. It only sits beside
 * the video on wide viewports, and it takes its width from
 * `--learning-curriculum-width`, which the app sets on the document before
 * first paint (and sets to zero while the column is collapsed).
 */
export function LearningWorkspaceFallback() {
  return (
    <div
      className="min-h-dvh bg-(--canvas) text-(--text)"
      data-learning-workspace-fallback=""
    >
      <div className="mx-auto grid w-full max-w-[1840px] grid-cols-[minmax(0,1fr)] min-[1081px]:grid-cols-[minmax(0,1fr)_minmax(0,var(--learning-curriculum-width,400px))]">
        <div className="min-w-0">
          <div
            className="aspect-video w-full bg-black"
            role="status"
            aria-busy="true"
            aria-label="Loading lesson"
          />
          <div
            className="grid content-start gap-4 px-[clamp(12px,1.5vw,20px)] py-4"
            aria-hidden="true"
          >
            <LessonContentPlaceholderBars />
          </div>
        </div>
        <div
          className={`sticky top-0 hidden h-dvh min-w-0 flex-col gap-3 self-start overflow-hidden p-4 min-[1081px]:flex ${LESSON_SIDE_PLACEHOLDER_SURFACE_CLASS}`}
          aria-hidden="true"
        >
          <LessonSidePlaceholderBars />
        </div>
      </div>
    </div>
  );
}
