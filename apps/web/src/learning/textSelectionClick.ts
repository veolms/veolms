function selectionWithin(node: Node) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  return selection.getRangeAt(0).intersectsNode(node) ? selection : null;
}

/**
 * Says whether a click on text that can also be selected only finished a
 * selection: the release of a drag that selected some of it, or the second
 * or third click of a double or triple click (a word, a line). Such a click
 * is not a press of what it landed on. A key press (detail 0) always is.
 */
export function endsTextSelection(event: {
  currentTarget: Node;
  detail: number;
}) {
  return event.detail > 1 || selectionWithin(event.currentTarget) !== null;
}

/**
 * For `onMouseDown` beside `endsTextSelection`: a fresh press lets go of a
 * selection left in the text from before. A browser keeps one there when a
 * button is pressed, and the click would then be taken for the end of it.
 */
export function releaseEarlierSelection(event: {
  currentTarget: Node;
  detail: number;
}) {
  if (event.detail !== 1) return;
  selectionWithin(event.currentTarget)?.removeAllRanges();
}
