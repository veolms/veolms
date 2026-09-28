export type ClipboardNotice = (message: string) => void;

export async function copyTextToClipboard(
  text: string,
  onNotice?: ClipboardNotice,
): Promise<boolean> {
  if (!text.trim()) return false;

  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      throw new Error("Clipboard unavailable");
    }
    await navigator.clipboard.writeText(text);
    onNotice?.("Text copied");
    return true;
  } catch {
    onNotice?.("Couldn't copy text");
    return false;
  }
}
