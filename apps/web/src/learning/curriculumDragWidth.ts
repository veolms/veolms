import { writeSplitFrameDragWidth } from "../components/splitFrame";

/**
 * Where a drag of the course content's gutter puts the width it has reached.
 *
 * The page's own width lives on the document (`--learning-curriculum-width`),
 * where every element inherits it, so changing it there re-styles the whole
 * page. Done on every frame of a drag, that was most of each frame's work and
 * the drag could not keep up with the pointer. A drag therefore leaves the
 * document's value alone and writes the width onto the few elements that are
 * sized from it, as properties that are not inherited: SplitFramePane's
 * boxes (split-frame-pane.css explains), the lesson, and the course content
 * itself, which is laid out at its last width at or over the minimum
 * (learning.css). Each write then re-styles those elements and
 * nothing else.
 */
const DRAG_CONTENT_WIDTH_PROPERTY = "--learning-curriculum-drag-content-width";

export interface CurriculumDragWidth {
  /** How wide the course content is while the pointer is held. */
  previewWidth: number;
  /** The width its content is laid out at; never under the minimum. */
  expandedWidth: number;
}

/**
 * The lesson and the content's own pane, then the content inside that pane.
 * Looked up child by child, so a move of the pointer does not search the
 * lesson for them.
 */
function findSized(workspace: HTMLElement) {
  const lesson = workspace.querySelector<HTMLElement>(
    ":scope > .learning-workspace__main",
  );
  const pane =
    lesson?.querySelector<HTMLElement>(
      ":scope > .learning-workspace__curriculum-clip",
    ) ?? null;
  return {
    sized: [lesson, pane],
    content:
      pane?.querySelector<HTMLElement>(
        ".learning-curriculum__viewport > .learning-curriculum",
      ) ?? null,
  };
}

export function applyCurriculumDragWidth(
  workspace: HTMLElement,
  { previewWidth, expandedWidth }: CurriculumDragWidth,
) {
  const { sized, content } = findSized(workspace);
  writeSplitFrameDragWidth(workspace, previewWidth, sized);
  content?.style.setProperty(DRAG_CONTENT_WIDTH_PROPERTY, `${expandedWidth}px`);
}

/** Hands the width back to the document's own value. */
export function clearCurriculumDragWidth(workspace: HTMLElement) {
  const { sized, content } = findSized(workspace);
  writeSplitFrameDragWidth(workspace, null, sized);
  content?.style.removeProperty(DRAG_CONTENT_WIDTH_PROPERTY);
}
