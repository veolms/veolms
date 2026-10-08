export type ClipboardNotice = (message: string) => void;

/**
 * Copies through a selection, for where the clipboard API is missing or
 * refuses: pages not served over HTTPS, embedded browsers, and calls the
 * browser no longer counts as part of the click.
 */
function copyThroughSelection(text: string): boolean {
  if (typeof document === "undefined") return false;
  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  // Inside the element that has focus (a menu, a dialog), so focusing the
  // field is not read as leaving it.
  (previouslyFocused?.parentElement ?? document.body).appendChild(field);
  let copied = false;
  try {
    field.focus({ preventScroll: true });
    field.select();
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  previouslyFocused?.focus({ preventScroll: true });
  return copied;
}

/**
 * Copies text to the clipboard. Call it directly from the click that asked
 * for it: browsers refuse a copy that is no longer part of a user action.
 */
export async function copyTextToClipboard(
  text: string,
  onNotice?: ClipboardNotice,
): Promise<boolean> {
  if (!text.trim()) return false;

  let copied = false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) copied = copyThroughSelection(text);

  onNotice?.(copied ? "Text copied" : "Couldn't copy text");
  return copied;
}
