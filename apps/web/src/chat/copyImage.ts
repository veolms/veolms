import type { ChatAttachment } from "@veolms/contracts";

import { chatService } from "../services/chat";

/** Clipboards take PNG only: other kinds (WebP, JPEG) are redrawn as PNG. */
async function asPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (png) => (png ? resolve(png) : reject(new Error("No image"))),
      "image/png",
    ),
  );
}

export function canCopyImages(): boolean {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.clipboard?.write)
  );
}

/**
 * WhatsApp's Copy on a photo: the picture itself goes to the clipboard (and
 * its caption as text), ready to paste into another app. The item is made
 * from a promise so the browser keeps the click's permission while the
 * photo downloads (Safari requires this).
 */
export async function copyImage(
  attachment: Pick<ChatAttachment, "url">,
  caption: string,
): Promise<void> {
  const png = chatService.readFileBlob(attachment).then((blob) => asPng(blob));
  const item: Record<string, Promise<Blob>> = { "image/png": png };
  if (caption) {
    item["text/plain"] = Promise.resolve(
      new Blob([caption], { type: "text/plain" }),
    );
  }
  await navigator.clipboard.write([new ClipboardItem(item)]);
}
