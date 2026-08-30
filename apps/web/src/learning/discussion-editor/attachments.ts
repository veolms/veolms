import type { DiscussionEditorCommands } from "./commands";
import {
  localDiscussionAttachmentStorage,
  type DiscussionAttachmentStorage,
} from "./image-storage";

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_VIDEO_BYTES = 50_000_000;

export interface DiscussionAttachmentResult {
  inserted: boolean;
  message: string | null;
}

export function getClipboardMediaFiles(
  clipboardData: DataTransfer | null,
): File[] {
  if (!clipboardData) return [];

  const itemFiles = Array.from(clipboardData.items)
    .filter(
      (item) =>
        item.kind === "file" &&
        (item.type.startsWith("image/") || item.type.startsWith("video/")),
    )
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (itemFiles.length > 0) return itemFiles;
  return Array.from(clipboardData.files).filter(
    (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
  );
}

export async function insertDiscussionAttachment(
  commands: DiscussionEditorCommands,
  file: File,
  storage: DiscussionAttachmentStorage = localDiscussionAttachmentStorage,
): Promise<DiscussionAttachmentResult> {
  const validationMessage = validateAttachment(file);
  if (validationMessage) return { inserted: false, message: validationMessage };

  try {
    const stored = await storage.upload(file);
    const escapedName = escapeMarkdownLabel(
      file.name ||
        stored.fileName ||
        (stored.mediaType === "image" ? "Image" : "Video"),
    );
    const alt =
      stored.mediaType === "video" ? `video: ${escapedName}` : escapedName;
    commands.insertMarkdown(`\n![${alt}](${stored.url})\n`);
    return { inserted: true, message: null };
  } catch {
    return {
      inserted: false,
      message: `That ${file.type.startsWith("video/") ? "video" : "image"} could not be uploaded. Please try again.`,
    };
  }
}

function validateAttachment(file: File) {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return "Choose an image or video file.";
  if (isImage && file.size > MAX_IMAGE_BYTES)
    return "Images must be smaller than 1.5 MB.";
  if (isVideo && file.size > MAX_VIDEO_BYTES)
    return "Videos must be smaller than 50 MB.";
  return null;
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/[\\\[\]]/g, "\\$&");
}
