const EDITING_TARGET_SELECTOR =
  "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])";

const INTERACTIVE_TARGET_SELECTOR =
  "button, a[href], input, textarea, select, [role='button'], [role='tab'], [role='option'], [role='radio'], [role='checkbox'], [role='listbox'], [tabindex]:not([tabindex='-1'])";

const NAVIGATION_OWNER_SELECTOR = [
  '[role="slider"]',
  '[role="separator"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="tab"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="checkbox"]',
].join(",");

const NATIVE_ACTIVATION_OWNER_SELECTOR = [
  "button",
  "[role='button']",
  "[role='menuitem']",
  "[role='menuitemradio']",
  "[role='menuitemcheckbox']",
  "[role='radio']",
  "[role='checkbox']",
].join(",");

const OWNED_NAVIGATION_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

export function isEditingShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(EDITING_TARGET_SELECTOR))
  );
}

export function isInteractiveShortcutTarget(
  target: EventTarget | null,
  playerRoot: Element | null,
): boolean {
  if (!(target instanceof Element)) return false;
  const interactiveTarget = target.closest(INTERACTIVE_TARGET_SELECTOR);
  return Boolean(interactiveTarget && interactiveTarget !== playerRoot);
}

export function isOwnedNavigationShortcut(
  event: Pick<KeyboardEvent, "code" | "target">,
): boolean {
  return (
    OWNED_NAVIGATION_CODES.has(event.code) &&
    event.target instanceof Element &&
    Boolean(event.target.closest(NAVIGATION_OWNER_SELECTOR))
  );
}

function isNativeActivationShortcut(
  event: Pick<KeyboardEvent, "code" | "target">,
): boolean {
  return (
    event.code === "Space" &&
    event.target instanceof Element &&
    !event.target.closest("[data-player-shortcut-surface]") &&
    Boolean(event.target.closest(NATIVE_ACTIVATION_OWNER_SELECTOR))
  );
}

export function shouldIgnorePlayerShortcut(
  event: KeyboardEvent,
  _playerRoot: Element | null,
): boolean {
  return (
    event.defaultPrevented ||
    event.isComposing ||
    isEditingShortcutTarget(event.target) ||
    isNativeActivationShortcut(event) ||
    isOwnedNavigationShortcut(event)
  );
}
