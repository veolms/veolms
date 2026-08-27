import type { Editor } from "@tiptap/core";

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_VIDEO_BYTES = 50_000_000;

export interface CommentAttachmentResult {
  inserted: boolean;
  message: string | null;
}

export function getClipboardMediaFile(
  clipboardData: DataTransfer | null,
): File | null {
  if (!clipboardData) return null;

  const itemFile = Array.from(clipboardData.items)
    .find(
      (item) =>
        item.kind === "file" &&
        (item.type.startsWith("image/") || item.type.startsWith("video/")),
    )
    ?.getAsFile();

  if (itemFile) return itemFile;

  return (
    Array.from(clipboardData.files).find(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("video/"),
    ) ?? null
  );
}

export async function insertCommentAttachment(
  editor: Editor,
  file: File,
): Promise<CommentAttachmentResult> {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    return { inserted: false, message: "Choose an image or video file." };
  }

  if (isImage && file.size > MAX_IMAGE_BYTES) {
    return { inserted: false, message: "Images must be smaller than 1.5 MB." };
  }

  if (isVideo) {
    if (file.size > MAX_VIDEO_BYTES) {
      return { inserted: false, message: "Videos must be smaller than 50 MB." };
    }

    const objectUrl = URL.createObjectURL(file);
    const inserted = editor
      .chain()
      .focus()
      .insertContent({
        type: "discussionVideo",
        attrs: { src: objectUrl, title: file.name },
      })
      .run();

    if (!inserted) URL.revokeObjectURL(objectUrl);
    return {
      inserted,
      message: inserted ? null : "That video could not be added.",
    };
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const inserted = editor
      .chain()
      .focus()
      .setImage({ src: dataUrl, alt: file.name || "Pasted image" })
      .run();

    return {
      inserted,
      message: inserted
        ? null
        : "That image could not be added. Please try another file.",
    };
  } catch {
    return {
      inserted: false,
      message: "That image could not be added. Please try another file.",
    };
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected file could not be read."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
