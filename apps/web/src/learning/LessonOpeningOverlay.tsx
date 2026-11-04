import { LessonContentPlaceholderBars } from "./LessonPagePlaceholders";
import { useLessonOpening } from "./lessonOpeningState";

/**
 * The lesson page as it looks while it loads, on a phone: the video's black
 * box with its loader at the top, and the placeholders of what goes under
 * it. Shown the moment a lesson is asked for from another page, so the tap
 * is answered at once while the lesson page's code is still on its way (see
 * lessonOpeningState). It lies under the bottom navigation, as the lesson
 * page does.
 *
 * Wider layouts keep the page they are on until the lesson replaces it:
 * they are not the slow devices this is for, and a page with a sidebar
 * would flash.
 *
 * It listens for the request itself, so that a tap re-renders only this and
 * not the layout around it.
 */
export function LessonOpeningOverlay({
  suppressed,
}: {
  /**
   * Something else is already showing the lesson: the lesson page, or the
   * player that grows back into it from its mini player.
   */
  suppressed: boolean;
}) {
  const opening = useLessonOpening();
  if (!opening || suppressed) return null;
  return (
    <div
      className="fixed inset-0 z-130 hidden flex-col overflow-hidden bg-(--canvas) max-[640px]:flex"
      role="status"
      aria-label="Opening lesson"
      data-lesson-opening=""
    >
      <div className="relative grid aspect-video w-full shrink-0 place-items-center bg-black">
        <span
          aria-hidden="true"
          className="size-12 animate-spin rounded-full border-[3.5px] border-white/20 border-t-white border-r-white motion-reduce:animate-none"
        />
      </div>
      <div className="grid content-start gap-4 px-4 pt-4">
        <LessonContentPlaceholderBars />
      </div>
    </div>
  );
}
