/**
 * The phone's menus that a tap outside closes (the colour menu, the settings
 * menu, reading mode's settings), and the buttons that open them.
 */
const OPEN_MENU_SELECTOR =
  '[data-palette-menu], [data-settings-quick-menu][data-open="true"], [data-reading-mode-menu]';
const MENU_TRIGGER_SELECTOR =
  "[data-palette-trigger], [data-mobile-palette-trigger], [data-settings-quick-trigger], [data-reading-mode-trigger]";
/** The click that ends a tap comes well within this. */
const SWALLOW_WINDOW_MS = 600;

/**
 * A tap outside an open menu only closes the menu, as on WhatsApp. The menu
 * closes on the tap's pointerdown; the click that follows went on to
 * whatever lay under the finger, so closing the Theme or Settings menu also
 * opened Help, a page or a link beneath it (learners' report, 16 Nov).
 * Touch and pen only: a mouse click outside keeps doing what it pointed at.
 *
 * Listened to on the document in the capture phase, before the app's own
 * handlers close the menu (by then it may already be gone from the page).
 */
export function guardMenuTapThrough(event: PointerEvent): void {
  if (event.pointerType === "mouse") return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const menus = document.querySelectorAll(OPEN_MENU_SELECTOR);
  if (menus.length === 0) return;
  // A tap in a menu, or on the button that toggles one, is its own.
  if (target.closest(MENU_TRIGGER_SELECTOR)) return;
  for (const menu of menus) if (menu.contains(target)) return;

  let timer = 0;
  const swallow = (click: Event) => {
    click.preventDefault();
    click.stopPropagation();
    stop();
  };
  const stop = () => {
    window.clearTimeout(timer);
    document.removeEventListener("click", swallow, true);
  };
  document.addEventListener("click", swallow, true);
  timer = window.setTimeout(stop, SWALLOW_WINDOW_MS);
}
