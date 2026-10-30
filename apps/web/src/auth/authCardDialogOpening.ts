// Opening the login card's pop-up quickly.
//
// `showModal()` makes the rest of the page inert in the same task, and the
// browser then restyles every element on the page: measured at 40-60 ms on
// an empty dialog at phone speed (4x CPU), 135 ms with the login card,
// before the card could paint, and about as long again on close. A popover
// reaches the top layer the same way (above everything, with a ::backdrop)
// in about 2 ms. So the card is shown as a popover and painted first, and
// the page behind is made inert in the next task, which is what the modal
// did, a frame later. Escape, focus and its return are the modal's, done
// here by hand.

/** Marks a pop-up opened here as open, like `dialog[open]` for a modal. */
export const DIALOG_OPEN_ATTRIBUTE = "data-dialog-open";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function canOpenAsPopover(dialog: HTMLDialogElement): boolean {
  return typeof dialog.showPopover === "function";
}

/** Everything outside the dialog: the siblings of it and of its ancestors. */
function makeRestOfPageInert(dialog: HTMLElement): () => void {
  const madeInert: HTMLElement[] = [];
  let node: HTMLElement | null = dialog;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of parent.children) {
      if (
        sibling !== node &&
        sibling instanceof HTMLElement &&
        !sibling.inert &&
        !(sibling instanceof HTMLScriptElement) &&
        !(sibling instanceof HTMLStyleElement) &&
        !(sibling instanceof HTMLLinkElement)
      ) {
        sibling.inert = true;
        madeInert.push(sibling);
      }
    }
    node = parent;
  }
  return () => {
    for (const element of madeInert) element.inert = false;
  };
}

export function openWithoutBlocking(
  dialog: HTMLDialogElement,
  {
    onOpened,
    onEscape,
    onBackdropClick,
  }: {
    onOpened: () => void;
    onEscape: () => void;
    onBackdropClick: () => void;
  },
): () => void {
  const returnFocusTo =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  dialog.showPopover();
  dialog.setAttribute(DIALOG_OPEN_ATTRIBUTE, "");
  // As the modal did: an autofocus field, else the first thing that takes
  // focus. Something inside that already has focus keeps it.
  if (!dialog.contains(document.activeElement)) {
    const target =
      dialog.querySelector<HTMLElement>("[autofocus]") ??
      dialog.querySelector<HTMLElement>(FOCUSABLE);
    (target ?? dialog).focus({ preventScroll: true });
  }
  onOpened();

  let restoreInert: (() => void) | null = null;
  let timer = 0;
  // After the frame that paints the card, in a task of its own.
  const frame = requestAnimationFrame(() => {
    timer = window.setTimeout(() => {
      restoreInert = makeRestOfPageInert(dialog);
    }, 0);
  });

  const onKeyDown = (event: KeyboardEvent) => {
    // Something inside (an open menu) may have handled Escape already.
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onEscape();
  };
  document.addEventListener("keydown", onKeyDown);

  // A modal's backdrop takes the presses around the card; a popover's lets
  // them through to the page under it (inert, a frame after opening). So
  // presses outside the card stop here, before reaching the page, and a
  // click whose press also began outside counts as one on the backdrop.
  let pressBeganOutside = false;
  const isOutside = (event: Event) =>
    event.target instanceof Node && !dialog.contains(event.target);
  const onPointerDown = (event: PointerEvent) => {
    pressBeganOutside = isOutside(event);
    if (pressBeganOutside) event.stopPropagation();
  };
  // A press outside would move focus to the page before the card closes,
  // and focus could not then go back where it was.
  const onMouseDown = (event: MouseEvent) => {
    if (isOutside(event)) event.preventDefault();
  };
  const onClick = (event: MouseEvent) => {
    if (!isOutside(event)) {
      pressBeganOutside = false;
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const beganOutside = pressBeganOutside;
    pressBeganOutside = false;
    if (beganOutside) onBackdropClick();
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("click", onClick, true);

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("click", onClick, true);
    const hadFocus = dialog.contains(document.activeElement);
    dialog.removeAttribute(DIALOG_OPEN_ATTRIBUTE);
    if (dialog.matches(":popover-open")) dialog.hidePopover();
    const returnFocus = () => {
      if (hadFocus && returnFocusTo?.isConnected) {
        returnFocusTo.focus({ preventScroll: true });
      }
    };
    // The card is gone from the screen first; the page wakes up after, and
    // only then can focus go back to it.
    if (restoreInert) {
      const restore = restoreInert;
      window.setTimeout(() => {
        restore();
        returnFocus();
      }, 0);
    } else {
      returnFocus();
    }
  };
}
